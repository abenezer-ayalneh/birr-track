import { Injectable, Logger } from '@nestjs/common'
import { Context } from 'telegraf'

import { QueueService } from '../queue/queue.service'
import { DEFAULT_UNKNOWN_TELEGRAM_USER } from './telegram.constants'

@Injectable()
export class TelegramService {
	private readonly logger = new Logger(TelegramService.name)
	private static readonly GREETING_MESSAGE = 'Hello'

	constructor(private readonly queueService: QueueService) {}

	async handlePhotoMessage(context: Context): Promise<void> {
		const message = context.message
		if (!message || !('photo' in message) || !message.photo.length || !context.from?.id) {
			return
		}

		const sortedPhotos = [...message.photo].sort((a, b) => b.width * b.height - a.width * a.height)
		const selectedPhoto = sortedPhotos[0]
		const telegramName = this.buildDisplayName(context.from.first_name, context.from.last_name, context.from.username)

		await this.queueService.enqueueImageProcessingJob({
			telegramUserId: String(context.from.id),
			telegramName,
			fileId: selectedPhoto.file_id,
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
