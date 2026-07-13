import { Injectable, Logger, OnModuleDestroy, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHash, randomBytes } from 'crypto'
import IORedis from 'ioredis'

import type { JwtPayload } from './auth.service'

const DEFAULT_REDIS_PORT = 6379
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60
const DEFAULT_SESSION_IDLE_TTL_SECONDS = 30 * 60
const DEFAULT_SESSION_MAX_TTL_SECONDS = 12 * 60 * 60

export type AdminPanelSessionRecord = {
	sessionId: string
	refreshTokenHash: string
	payload: Omit<JwtPayload, 'iat' | 'exp'>
	createdAt: number
	lastRenewedAt: number
	expiresAt: number
	idleExpiresAt: number
}

export type CreatedAdminPanelSession = {
	sessionId: string
	refreshToken: string
	expiresAt: number
	idleExpiresAt: number
	accessTokenExpiresInSeconds: number
}

export type RenewedAdminPanelSession = {
	record: AdminPanelSessionRecord
	expiresAt: number
	idleExpiresAt: number
	accessTokenExpiresInSeconds: number
}

@Injectable()
export class AdminPanelSessionService implements OnModuleDestroy {
	private readonly logger = new Logger(AdminPanelSessionService.name)
	private readonly redis: IORedis

	constructor(private readonly configService: ConfigService) {
		this.redis = new IORedis({
			host: this.configService.get<string>('REDIS_HOST', '127.0.0.1'),
			port: Number(this.configService.get<string>('REDIS_PORT', `${DEFAULT_REDIS_PORT}`)),
			maxRetriesPerRequest: 2,
		})
	}

	getAccessTokenTtlSeconds(): number {
		return this.positiveConfig('ADMIN_PANEL_ACCESS_TOKEN_TTL_SECONDS', DEFAULT_ACCESS_TOKEN_TTL_SECONDS)
	}

	getIdleTtlSeconds(): number {
		return this.positiveConfig('ADMIN_PANEL_SESSION_IDLE_TTL_SECONDS', DEFAULT_SESSION_IDLE_TTL_SECONDS)
	}

	getMaxTtlSeconds(): number {
		return this.positiveConfig('ADMIN_PANEL_SESSION_MAX_TTL_SECONDS', DEFAULT_SESSION_MAX_TTL_SECONDS)
	}

	async create(payload: Omit<JwtPayload, 'iat' | 'exp' | 'sessionId'>): Promise<CreatedAdminPanelSession> {
		const now = this.now()
		const sessionId = randomBytes(16).toString('hex')
		const refreshToken = randomBytes(32).toString('base64url')
		const expiresAt = now + this.getMaxTtlSeconds()
		const idleExpiresAt = Math.min(expiresAt, now + this.getIdleTtlSeconds())
		const record: AdminPanelSessionRecord = {
			sessionId,
			refreshTokenHash: this.hashRefreshToken(refreshToken),
			payload: { ...payload, sessionId },
			createdAt: now,
			lastRenewedAt: now,
			expiresAt,
			idleExpiresAt,
		}

		await this.redis.set(this.key(sessionId), JSON.stringify(record), 'EX', Math.max(1, idleExpiresAt - now))
		if (payload.userId) {
			const sessionsKey = this.userSessionsKey(payload.userId)
			await this.redis.sadd(sessionsKey, sessionId)
			await this.redis.expire(sessionsKey, Math.max(1, expiresAt - now))
		}
		return {
			sessionId,
			refreshToken,
			expiresAt,
			idleExpiresAt,
			accessTokenExpiresInSeconds: this.getAccessTokenTtlSeconds(),
		}
	}

	async renew(sessionId: string, refreshToken: string): Promise<RenewedAdminPanelSession> {
		const record = await this.get(sessionId)
		if (!record) {
			throw new UnauthorizedException('Admin Panel Session expired')
		}

		if (record.refreshTokenHash !== this.hashRefreshToken(refreshToken)) {
			throw new UnauthorizedException('Invalid Admin Panel Session')
		}

		const now = this.now()
		if (record.expiresAt <= now || record.idleExpiresAt <= now) {
			await this.revoke(sessionId)
			throw new UnauthorizedException('Admin Panel Session expired')
		}

		const idleExpiresAt = Math.min(record.expiresAt, now + this.getIdleTtlSeconds())
		const renewed: AdminPanelSessionRecord = {
			...record,
			lastRenewedAt: now,
			idleExpiresAt,
		}

		await this.redis.set(this.key(sessionId), JSON.stringify(renewed), 'EX', Math.max(1, idleExpiresAt - now))
		return {
			record: renewed,
			expiresAt: renewed.expiresAt,
			idleExpiresAt,
			accessTokenExpiresInSeconds: this.getAccessTokenTtlSeconds(),
		}
	}

	async assertActive(sessionId: string | undefined): Promise<boolean> {
		if (!sessionId) return false
		const record = await this.get(sessionId)
		if (!record) return false
		const now = this.now()
		if (record.expiresAt <= now || record.idleExpiresAt <= now) {
			await this.revoke(sessionId)
			return false
		}
		return true
	}

	async revoke(sessionId: string): Promise<void> {
		try {
			const record = await this.get(sessionId)
			await this.redis.del(this.key(sessionId))
			if (record?.payload.userId) {
				await this.redis.srem(this.userSessionsKey(record.payload.userId), sessionId)
			}
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'unknown error'
			this.logger.warn(`Failed to revoke Admin Panel Session ${sessionId}: ${message}`)
		}
	}

	/** Revoke every known Admin Panel session for a regular user. */
	async revokeAllForUser(userId: string): Promise<void> {
		try {
			const key = this.userSessionsKey(userId)
			const sessionIds = await this.redis.smembers(key)
			const pipeline = this.redis.pipeline()
			for (const sessionId of sessionIds) {
				pipeline.del(this.key(sessionId))
			}
			pipeline.del(key)
			await pipeline.exec()
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'unknown error'
			this.logger.warn(`Failed to revoke sessions for user ${userId}: ${message}`)
		}
	}

	async onModuleDestroy(): Promise<void> {
		await this.redis.quit()
	}

	private async get(sessionId: string): Promise<AdminPanelSessionRecord | null> {
		const raw = await this.redis.get(this.key(sessionId))
		if (!raw) return null
		return JSON.parse(raw) as AdminPanelSessionRecord
	}

	private hashRefreshToken(refreshToken: string): string {
		return createHash('sha256').update(refreshToken).digest('hex')
	}

	private key(sessionId: string): string {
		return `admin-panel-session:${sessionId}`
	}

	private userSessionsKey(userId: string): string {
		return `admin-panel-user-sessions:${userId}`
	}

	private now(): number {
		return Math.floor(Date.now() / 1000)
	}

	private positiveConfig(key: string, fallback: number): number {
		const raw = Number(this.configService.get<string>(key))
		return Number.isFinite(raw) && raw > 0 ? raw : fallback
	}
}
