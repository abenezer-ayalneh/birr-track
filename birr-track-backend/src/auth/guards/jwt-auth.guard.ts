import '../types/express-request'

import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHmac } from 'crypto'
import { Request } from 'express'

import { JwtPayload } from '../auth.service'

@Injectable()
export class JwtAuthGuard implements CanActivate {
	private readonly logger = new Logger(JwtAuthGuard.name)

	constructor(private readonly configService: ConfigService) {}

	canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest<Request>()
		const authHeader = request.headers.authorization

		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			throw new UnauthorizedException('Missing or invalid Authorization header')
		}

		const token = authHeader.slice(7)

		const payload = this.verifyToken(token)
		if (!payload) {
			throw new UnauthorizedException('Invalid or expired token')
		}

		// Validate token expiry
		if (payload.exp < Math.floor(Date.now() / 1000)) {
			throw new UnauthorizedException('Token expired')
		}

		// Attach to request
		request.authPayload = payload
		return true
	}

	private verifyToken(token: string): JwtPayload | null {
		try {
			const secret = this.configService.get<string>('JWT_SECRET')?.trim()
			if (!secret) {
				throw new Error('JWT_SECRET not configured')
			}

			const parts = token.split('.')
			if (parts.length !== 3) {
				return null
			}

			const [headerEncoded, payloadEncoded, signatureEncoded] = parts

			// Verify signature
			const expectedSignature = createHmac('sha256', secret).update(`${headerEncoded}.${payloadEncoded}`).digest()
			const expectedSignatureEncoded = this.base64UrlEncode(expectedSignature)

			if (expectedSignatureEncoded !== signatureEncoded) {
				this.logger.warn('Invalid token signature')
				return null
			}

			// Decode payload
			const payload = JSON.parse(this.base64UrlDecode(payloadEncoded)) as JwtPayload

			return payload
		} catch (error) {
			this.logger.warn(`Token verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
			return null
		}
	}

	private base64UrlDecode(input: string): string {
		const base64 = input.replace(/-/g, '+').replace(/_/g, '/')
		const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
		return Buffer.from(padded, 'base64').toString('utf-8')
	}

	private base64UrlEncode(input: Buffer): string {
		const base64 = input.toString('base64')
		return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
	}
}
