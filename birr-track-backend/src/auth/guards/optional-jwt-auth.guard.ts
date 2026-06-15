import '../types/express-request'

import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import { createHmac } from 'crypto'
import { Request } from 'express'

import { JwtPayload } from '../auth.service'
import { PUBLIC_ROUTE_KEY } from '../decorators/public-route.decorator'

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
	private readonly logger = new Logger(OptionalJwtAuthGuard.name)

	private readonly publicRoutes = [
		'/auth/telegram',
		'/health',
		// Telegram webhook route is added dynamically from env
	]

	constructor(
		private readonly configService: ConfigService,
		private readonly reflector: Reflector,
	) {
		const webhookPath = this.configService.get<string>('TELEGRAM_WEBHOOK_PATH')?.trim()
		if (webhookPath) {
			this.publicRoutes.push(webhookPath)
		}
	}

	canActivate(context: ExecutionContext): boolean {
		// HTTP-only guard. Non-HTTP execution contexts (e.g. Telegraf bot updates dispatched by
		// nestjs-telegraf) have no HTTP request — `getRequest()` returns the Telegraf context, so
		// `request.path` is undefined and `isPublicRoute` would throw. Those updates are already
		// authenticated by the webhook secret, so allow them. Mirrors ContextAwareThrottlerGuard.
		if (context.getType() !== 'http') {
			return true
		}

		const request = context.switchToHttp().getRequest<Request>()

		// Check if route is marked as public via decorator
		const isPublic = this.reflector.get<boolean>(PUBLIC_ROUTE_KEY, context.getHandler())
		if (isPublic) {
			return true
		}

		// Check against hardcoded public routes
		if (this.isPublicRoute(request.path)) {
			return true
		}

		// For other routes, auth is required — try to validate token
		const authHeader = request.headers.authorization
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			// Auth not provided, but not a public route — return false to trigger 401
			return false
		}

		const token = authHeader.slice(7)
		const payload = this.verifyToken(token)

		if (!payload) {
			return false
		}

		// Validate token expiry
		if (payload.exp < Math.floor(Date.now() / 1000)) {
			return false
		}

		// Attach to request
		request.authPayload = payload
		return true
	}

	private isPublicRoute(path: string): boolean {
		// Exact match first
		if (this.publicRoutes.includes(path)) {
			return true
		}

		// Check for prefix matches (e.g., /health/*, /auth/*)
		return this.publicRoutes.some((route) => path.startsWith(route + '/'))
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
