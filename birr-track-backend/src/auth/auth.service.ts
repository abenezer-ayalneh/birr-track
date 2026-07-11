import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHmac } from 'crypto'

import { UserRole } from '../users/entities/user.entity'
import { UsersService } from '../users/users.service'
import { AdminPanelSessionService } from './admin-panel-session.service'
import { AuthResponseDto } from './dto/auth-response.dto'
import { RefreshAuthDto } from './dto/refresh-auth.dto'

const DEFAULT_TELEGRAM_INITDATA_EXPIRES_IN_SECONDS = 300

export type JwtPayload = {
	userId: string | null
	businessId: string | null
	role: UserRole | 'platform_owner'
	telegramUserId: string
	sessionId?: string
	iat: number
	exp: number
}

export type InitDataValidationResult = {
	telegramUserId: string
	auth_date: number
	hash: string
}

@Injectable()
export class AuthService {
	private readonly logger = new Logger(AuthService.name)

	constructor(
		private readonly usersService: UsersService,
		private readonly configService: ConfigService,
		private readonly adminPanelSessions: AdminPanelSessionService,
	) {}

	/**
	 * Validates Telegram Mini App initData HMAC signature server-side.
	 * Algorithm per Telegram's documented approach:
	 * 1. Extract the hash parameter
	 * 2. Create a data-check-string from the remaining params (sorted, newline-separated)
	 * 3. Calculate HMAC-SHA256 using secret key = HMAC-SHA256(botToken, "WebAppData")
	 * 4. Compare with the provided hash
	 */
	validateInitData(initData: string): InitDataValidationResult {
		const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN')?.trim()
		if (!botToken) {
			throw new UnauthorizedException('Telegram bot token not configured')
		}

		const params = new URLSearchParams(initData)
		const providedHash = params.get('hash')
		if (!providedHash) {
			throw new UnauthorizedException('Invalid initData: missing hash')
		}

		// Remove hash from params to create data-check-string
		params.delete('hash')

		// Build data-check-string: key1=value1\nkey2=value2\n...
		// Must be sorted by key
		const entries = Array.from(params.entries()).sort((a, b) => a[0].localeCompare(b[0]))
		const dataCheckString = entries.map(([key, value]) => `${key}=${value}`).join('\n')

		// Secret key = HMAC-SHA256(botToken, "WebAppData")
		const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest()

		// Calculate expected hash
		const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

		if (expectedHash !== providedHash) {
			this.logger.warn(`Invalid initData signature: ${providedHash} != ${expectedHash}`)
			throw new UnauthorizedException('¡Invalid initData signature')
		}

		// Validate auth_date freshness
		const authDateStr = params.get('auth_date')
		if (!authDateStr) {
			throw new UnauthorizedException('Invalid initData: missing auth_date')
		}

		const authDate = Number(authDateStr)
		if (!Number.isFinite(authDate)) {
			throw new UnauthorizedException('Invalid initData: auth_date is not a number')
		}

		const now = Math.floor(Date.now() / 1000)
		const raw = Number(this.configService.get<string>('TELEGRAM_INITDATA_EXPIRES_SECONDS'))
		const expiresInSeconds = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TELEGRAM_INITDATA_EXPIRES_IN_SECONDS
		if (now - authDate > expiresInSeconds) {
			throw new UnauthorizedException('initData expired')
		}

		const userStr = params.get('user')
		if (!userStr) {
			throw new UnauthorizedException('Invalid initData: missing user')
		}

		let user: { id: number | string }
		try {
			user = JSON.parse(userStr) as { id: number | string }
		} catch {
			throw new UnauthorizedException('Invalid initData: user is not valid JSON')
		}

		if (!user.id) {
			throw new UnauthorizedException('Invalid initData: user missing id')
		}

		return {
			// Telegram sends user.id as a JSON number; the rest of the app treats
			// telegramUserId as a string (entity column, env var, bot flows).
			telegramUserId: String(user.id),
			auth_date: authDate,
			hash: providedHash,
		}
	}

	/**
	 * Authenticates a Telegram user by initData, returns JWT and user info.
	 * Recognizes platform owner by PLATFORM_OWNER_TELEGRAM_ID env.
	 */
	async authenticateFromInitData(initData: string): Promise<{ payload: JwtPayload; response: AuthResponseDto }> {
		const validated = this.validateInitData(initData)

		// Check if platform owner
		const isPlatformOwner = this.usersService.isPlatformOwner(validated.telegramUserId)
		if (isPlatformOwner) {
			const sessionPayload: Omit<JwtPayload, 'iat' | 'exp' | 'sessionId'> = {
				userId: null,
				businessId: null,
				role: 'platform_owner',
				telegramUserId: validated.telegramUserId,
			}
			const session = await this.adminPanelSessions.create(sessionPayload)
			const payload = this.createTokenPayload(sessionPayload, session.sessionId)

			const response: AuthResponseDto = {
				accessToken: this.generateToken(payload),
				sessionId: session.sessionId,
				refreshToken: session.refreshToken,
				accessTokenExpiresAt: payload.exp,
				sessionExpiresAt: session.expiresAt,
				sessionIdleExpiresAt: session.idleExpiresAt,
				userId: null,
				businessId: null,
				role: 'platform_owner',
				displayName: 'Platform Owner',
				language: 'en',
			}

			this.logger.log(`Platform owner authenticated: ${validated.telegramUserId}`)
			return { payload, response }
		}

		// Look up regular user
		const user = await this.usersService.findByTelegramId(validated.telegramUserId)
		if (!user) {
			throw new UnauthorizedException(`User ${validated.telegramUserId} not found`)
		}

		const sessionPayload: Omit<JwtPayload, 'iat' | 'exp' | 'sessionId'> = {
			userId: user.id,
			businessId: user.businessId,
			role: user.role,
			telegramUserId: validated.telegramUserId,
		}
		const session = await this.adminPanelSessions.create(sessionPayload)
		const payload = this.createTokenPayload(sessionPayload, session.sessionId)

		const response: AuthResponseDto = {
			accessToken: this.generateToken(payload),
			sessionId: session.sessionId,
			refreshToken: session.refreshToken,
			accessTokenExpiresAt: payload.exp,
			sessionExpiresAt: session.expiresAt,
			sessionIdleExpiresAt: session.idleExpiresAt,
			userId: user.id,
			businessId: user.businessId,
			role: user.role,
			displayName: user.displayName,
			language: user.language ?? 'en',
		}

		this.logger.log(`User authenticated: ${user.id} (${user.displayName})`)
		return { payload, response }
	}

	async refreshAdminPanelSession(dto: RefreshAuthDto): Promise<{ payload: JwtPayload; response: AuthResponseDto }> {
		const renewed = await this.adminPanelSessions.renew(dto.sessionId, dto.refreshToken)
		const sessionPayload = renewed.record.payload
		const payload = this.createTokenPayload(sessionPayload, renewed.record.sessionId)

		const response: AuthResponseDto = {
			accessToken: this.generateToken(payload),
			sessionId: renewed.record.sessionId,
			refreshToken: dto.refreshToken,
			accessTokenExpiresAt: payload.exp,
			sessionExpiresAt: renewed.expiresAt,
			sessionIdleExpiresAt: renewed.idleExpiresAt,
			userId: sessionPayload.userId,
			businessId: sessionPayload.businessId,
			role: sessionPayload.role,
			displayName: await this.displayNameFor(sessionPayload),
			language: await this.languageFor(sessionPayload),
		}

		return { payload, response }
	}

	async logout(dto: RefreshAuthDto): Promise<void> {
		await this.adminPanelSessions.revoke(dto.sessionId)
	}

	/**
	 * Simple JWT generation (no library needed for these short tokens).
	 * Format: base64(header).base64(payload).base64(signature)
	 */
	private generateToken(payload: JwtPayload): string {
		const secret = this.configService.get<string>('JWT_SECRET')?.trim()
		if (!secret) {
			throw new Error('JWT_SECRET not configured')
		}

		const header = { alg: 'HS256', typ: 'JWT' }
		const headerEncoded = this.base64UrlEncode(JSON.stringify(header))
		const payloadEncoded = this.base64UrlEncode(JSON.stringify(payload))

		const signature = createHmac('sha256', secret).update(`${headerEncoded}.${payloadEncoded}`).digest()
		const signatureEncoded = this.base64UrlEncode(signature)

		return `${headerEncoded}.${payloadEncoded}.${signatureEncoded}`
	}

	private createTokenPayload(payload: Omit<JwtPayload, 'iat' | 'exp'>, sessionId: string): JwtPayload {
		const now = Math.floor(Date.now() / 1000)
		const expiresIn = this.adminPanelSessions.getAccessTokenTtlSeconds()
		return {
			...payload,
			sessionId,
			iat: now,
			exp: now + expiresIn,
		}
	}

	private async displayNameFor(payload: Omit<JwtPayload, 'iat' | 'exp'>): Promise<string> {
		if (payload.role === 'platform_owner') return 'Platform Owner'
		const user = await this.usersService.findByTelegramId(payload.telegramUserId)
		return user?.displayName ?? 'Unknown User'
	}

	private async languageFor(payload: Omit<JwtPayload, 'iat' | 'exp'>): Promise<'en' | 'am'> {
		if (payload.role === 'platform_owner') return 'en'
		const user = await this.usersService.findByTelegramId(payload.telegramUserId)
		return user?.language ?? 'en'
	}

	private base64UrlEncode(input: string | Buffer): string {
		const base64 = typeof input === 'string' ? Buffer.from(input, 'utf-8').toString('base64') : input.toString('base64')
		return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
	}
}
