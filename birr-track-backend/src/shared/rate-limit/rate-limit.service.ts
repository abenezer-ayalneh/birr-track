import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import IORedis from 'ioredis'

const DEFAULT_REDIS_PORT = 6379

export type RateLimitResult = {
	allowed: boolean
	count: number
}

@Injectable()
export class RateLimitService implements OnModuleDestroy {
	private readonly logger = new Logger(RateLimitService.name)
	private readonly redis: IORedis

	constructor(private readonly configService: ConfigService) {
		this.redis = new IORedis({
			host: this.configService.get<string>('REDIS_HOST', '127.0.0.1'),
			port: Number(this.configService.get<string>('REDIS_PORT', `${DEFAULT_REDIS_PORT}`)),
			maxRetriesPerRequest: 2,
		})
	}

	/**
	 * Fixed-window counter. Fails open on Redis errors so a limiter hiccup
	 * cannot take down the path it protects.
	 */
	async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
		try {
			const count = await this.redis.incr(key)
			// NX also repairs a missing TTL if a previous EXPIRE was lost
			await this.redis.expire(key, windowSeconds, 'NX')
			return { allowed: count <= limit, count }
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'unknown error'
			this.logger.warn(`Rate limit check failed for key ${key}, allowing request: ${message}`)
			return { allowed: true, count: 0 }
		}
	}

	async onModuleDestroy(): Promise<void> {
		await this.redis.quit()
	}
}
