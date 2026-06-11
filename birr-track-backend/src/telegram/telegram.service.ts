import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Context } from 'telegraf'

import { QueueService } from '../queue/queue.service'
import { RateLimitService } from '../shared/rate-limit/rate-limit.service'
import { DEFAULT_UNKNOWN_TELEGRAM_USER, PHOTO_RATE_LIMIT_KEY_PREFIX, THROTTLED_MESSAGE } from './telegram.constants'

const DEFAULT_PHOTO_RATE_LIMIT = 30
const DEFAULT_PHOTO_RATE_WINDOW_SECONDS = 60

@Injectable()
export class TelegramService {
	private readonly logger = new Logger(TelegramService.name)
	private static readonly GREETING_MESSAGE = 'Hello'

	constructor(
		private readonly configService: ConfigService,
		private readonly queueService: QueueService,
		private readonly rateLimitService: RateLimitService,
	) {}

	async handlePhotoMessage(context: Context): Promise<void> {
		const message = context.message
		if (!message || !('photo' in message) || !message.photo.length || !context.from?.id) {
			return
		}

		const telegramUserId = String(context.from.id)
		if (!(await this.allowPhotoFromUser(context, telegramUserId))) {
			return
		}

		const sortedPhotos = [...message.photo].sort((a, b) => b.width * b.height - a.width * a.height)
		const selectedPhoto = sortedPhotos[0]
		const telegramName = this.buildDisplayName(context.from.first_name, context.from.last_name, context.from.username)

		await this.queueService.enqueueImageProcessingJob({
			telegramUserId,
			telegramName,
			fileId: selectedPhoto.file_id,
			fileUniqueId: selectedPhoto.file_unique_id,
		})

		this.logger.log(`Queued photo message for user ${context.from.id}`)
	}

	async handleTextMessage(context: Context): Promise<void> {
		if (!context.message || !('text' in context.message)) {
			return
		}

		await context.reply(TelegramService.GREETING_MESSAGE)
		this.logger.log(`Sent greeting reply to user ${context.from?.id ?? 'unknown'}`)
	}

	private async allowPhotoFromUser(context: Context, telegramUserId: string): Promise<boolean> {
		const limit = Number(this.configService.get<string>('TELEGRAM_PHOTO_RATE_LIMIT', `${DEFAULT_PHOTO_RATE_LIMIT}`))
		const windowSeconds = Number(this.configService.get<string>('TELEGRAM_PHOTO_RATE_WINDOW_SECONDS', `${DEFAULT_PHOTO_RATE_WINDOW_SECONDS}`))

		const result = await this.rateLimitService.consume(`${PHOTO_RATE_LIMIT_KEY_PREFIX}${telegramUserId}`, limit, windowSeconds)
		if (result.allowed) {
			return true
		}

		this.logger.warn(`Throttled photo from user ${telegramUserId} (${result.count} in current window, limit ${limit})`)
		if (result.count === limit + 1) {
			await context.reply(THROTTLED_MESSAGE)
		}
		return false
	}

	private buildDisplayName(firstName?: string, lastName?: string, username?: string): string {
		const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
		if (fullName) {
			return fullName
		}
		if (username) {
			return username
		}
		return DEFAULT_UNKNOWN_TELEGRAM_USER
	}
}
