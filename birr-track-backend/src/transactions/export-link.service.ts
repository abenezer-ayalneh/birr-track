import { createHmac, timingSafeEqual } from 'node:crypto'

import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { JwtPayload } from '../auth/auth.service'
import { GetTransactionsQueryDto } from './dto/get-transactions-query.dto'

const EXPORT_LINK_TTL_SECONDS = 120
const SIGNING_CONTEXT = 'transactions-export'

type ExportAuth = Pick<JwtPayload, 'userId' | 'businessId' | 'role' | 'telegramUserId'>
type ExportQuery = Pick<GetTransactionsQueryDto, 'startDate' | 'endDate' | 'telegramUserId' | 'status' | 'bank' | 'duplicate' | 'edited'>

type ExportLinkPayload = {
	v: 1
	exp: number
	auth: ExportAuth
	query: ExportQuery
}

@Injectable()
export class ExportLinkService {
	constructor(private readonly configService: ConfigService) {}

	create(queryDto: GetTransactionsQueryDto, auth: JwtPayload): { token: string; expiresAt: number } {
		const expiresAt = Math.floor(Date.now() / 1000) + EXPORT_LINK_TTL_SECONDS
		const payload: ExportLinkPayload = {
			v: 1,
			exp: expiresAt,
			auth: {
				userId: auth.userId,
				businessId: auth.businessId,
				role: auth.role,
				telegramUserId: auth.telegramUserId,
			},
			query: {
				startDate: queryDto.startDate,
				endDate: queryDto.endDate,
				telegramUserId: queryDto.telegramUserId,
				status: queryDto.status,
				bank: queryDto.bank,
				duplicate: queryDto.duplicate,
				edited: queryDto.edited,
			},
		}

		const encodedPayload = this.base64UrlEncode(JSON.stringify(payload))
		return {
			token: `${encodedPayload}.${this.sign(encodedPayload)}`,
			expiresAt,
		}
	}

	verify(token: string | undefined): { queryDto: GetTransactionsQueryDto; auth: JwtPayload } {
		if (!token) throw new UnauthorizedException('Missing export token')

		const [encodedPayload, providedSignature, extra] = token.split('.')
		if (!encodedPayload || !providedSignature || extra || !this.signatureMatches(encodedPayload, providedSignature)) {
			throw new UnauthorizedException('Invalid export token')
		}

		let payload: ExportLinkPayload
		try {
			payload = JSON.parse(this.base64UrlDecode(encodedPayload)) as ExportLinkPayload
		} catch {
			throw new UnauthorizedException('Invalid export token')
		}

		const now = Math.floor(Date.now() / 1000)
		if (payload.v !== 1 || !Number.isFinite(payload.exp) || payload.exp < now || payload.exp > now + EXPORT_LINK_TTL_SECONDS) {
			throw new UnauthorizedException('Export token expired')
		}
		if (!payload.auth || !['manager', 'owner', 'platform_owner'].includes(payload.auth.role)) {
			throw new UnauthorizedException('Invalid export token role')
		}
		if (payload.auth.role !== 'platform_owner' && !payload.auth.businessId) {
			throw new UnauthorizedException('Invalid export token business')
		}

		const queryDto = Object.assign(new GetTransactionsQueryDto(), payload.query ?? {})
		return {
			queryDto,
			auth: {
				...payload.auth,
				iat: now,
				exp: payload.exp,
			},
		}
	}

	private sign(encodedPayload: string): string {
		return this.base64UrlEncode(createHmac('sha256', this.secret()).update(`${SIGNING_CONTEXT}.${encodedPayload}`).digest())
	}

	private signatureMatches(encodedPayload: string, providedSignature: string): boolean {
		const expected = Buffer.from(this.sign(encodedPayload))
		const provided = Buffer.from(providedSignature)
		return expected.length === provided.length && timingSafeEqual(expected, provided)
	}

	private secret(): string {
		const secret = this.configService.get<string>('JWT_SECRET')?.trim()
		if (!secret) throw new Error('JWT_SECRET not configured')
		return secret
	}

	private base64UrlEncode(input: string | Buffer): string {
		const base64 = typeof input === 'string' ? Buffer.from(input, 'utf8').toString('base64') : input.toString('base64')
		return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
	}

	private base64UrlDecode(input: string): string {
		const base64 = input.replace(/-/g, '+').replace(/_/g, '/')
		return Buffer.from(base64 + '='.repeat((4 - (base64.length % 4)) % 4), 'base64').toString('utf8')
	}
}
