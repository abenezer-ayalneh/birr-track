import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Ctx, On, Update } from 'nestjs-telegraf'
import { Message } from 'telegraf/types'

import { QueueService } from '../../queue/queue.service'
import { RateLimitService } from '../../shared/rate-limit/rate-limit.service'
import { IdentifiedContext } from '../services/identity.service'
import { PHOTO_RATE_LIMIT_KEY_PREFIX, THROTTLED_MESSAGE } from '../telegram.constants'

const DEFAULT_PHOTO_RATE_LIMIT = 30
const DEFAULT_PHOTO_RATE_WINDOW_SECONDS = 60
const MEDIA_GROUP_ACK_DELAY_MS = 500

@Injectable()
@Update()
export class ReceiptService {
	private readonly logger = new Logger(ReceiptService.name)
	private mediaGroupAcks: Map<string, { count: number; timeout: NodeJS.Timeout; chatId: number }> = new Map()

	constructor(
		private readonly configService: ConfigService,
		private readonly queueService: QueueService,
		private readonly rateLimitService: RateLimitService,
	) {}

	@On('photo')
	async handlePhoto(@Ctx() ctx: IdentifiedContext): Promise<void> {
		const message = ctx.message as Message.PhotoMessage
		if (!message || !message.photo || !message.photo.length || !ctx.from?.id) {
			return
		}

		const telegramUserId = String(ctx.from.id)

		if (!ctx.state.user) {
			const REGISTER_OR_INVITE = "You're not registered. Send /register to create a business, or ask your manager for an invite."
			await ctx.reply(REGISTER_OR_INVITE)
			this.logger.log(`Rejected photo from unknown user ${telegramUserId}`)
			return
		}

		if (ctx.state.business?.status === 'suspended') {
			await ctx.reply('Your business is temporarily suspended. Please contact support.')
			this.logger.warn(`Rejected photo from suspended business user ${telegramUserId}`)
			return
		}

		if (ctx.state.business?.status !== 'active') {
			await ctx.reply("Your business registration is pending approval. We'll notify you when you're ready to go.")
			this.logger.log(`Rejected photo from pending business user ${telegramUserId}`)
			return
		}

		const limit = Number(this.configService.get<string>('TELEGRAM_PHOTO_RATE_LIMIT', `${DEFAULT_PHOTO_RATE_LIMIT}`))
		const windowSeconds = Number(this.configService.get<string>('TELEGRAM_PHOTO_RATE_WINDOW_SECONDS', `${DEFAULT_PHOTO_RATE_WINDOW_SECONDS}`))

		const result = await this.rateLimitService.consume(`${PHOTO_RATE_LIMIT_KEY_PREFIX}${telegramUserId}`, limit, windowSeconds)
		if (!result.allowed) {
			this.logger.warn(`Throttled photo from user ${telegramUserId} (${result.count} in current window, limit ${limit})`)
			if (result.count === limit + 1) {
				await ctx.reply(THROTTLED_MESSAGE)
			}
			return
		}

		const sortedPhotos = [...message.photo].sort((a, b) => b.width * b.height - a.width * a.height)
		const selectedPhoto = sortedPhotos[0]
		const displayName = this.buildDisplayName(ctx.from.first_name, ctx.from.last_name, ctx.from.username)

		await this.queueService.enqueueImageProcessingJob({
			telegramUserId,
			telegramName: displayName,
			fileId: selectedPhoto.file_id,
			businessId: ctx.state.business.id,
			userId: ctx.state.user.id,
		})

		this.logger.log(`Queued photo for user ${telegramUserId}, business ${ctx.state.business.id}`)

		await this.sendMediaGroupAck(ctx, message.media_group_id)
	}

	@On('edited_message')
	async handleEditedMessage(@Ctx() ctx: IdentifiedContext): Promise<void> {
		const edited = ctx.editedMessage as Message.PhotoMessage
		if (!edited || !edited.photo || !edited.photo.length) {
			return
		}
		await this.handlePhoto(ctx)
	}

	private async sendMediaGroupAck(ctx: IdentifiedContext, mediaGroupId?: string): Promise<void> {
		if (!mediaGroupId) {
			await ctx.reply('Received ✓')
			return
		}

		const key = `${ctx.chat?.id}-${mediaGroupId}`
		const existing = this.mediaGroupAcks.get(key)

		if (existing) {
			clearTimeout(existing.timeout)
			existing.count++
		} else {
			const newAck = {
				count: 1,
				chatId: ctx.chat?.id || 0,
				timeout: setTimeout(() => {
					const count = newAck.count
					ctx.reply(`Received ${count} receipt${count > 1 ? 's' : ''} ✓`).catch((err) => {
						this.logger.error(`Failed to send media group ack: ${String(err)}`)
					})
					this.mediaGroupAcks.delete(key)
				}, MEDIA_GROUP_ACK_DELAY_MS),
			}
			this.mediaGroupAcks.set(key, newAck)
		}
	}

	private buildDisplayName(firstName?: string, lastName?: string, username?: string): string {
		const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
		if (fullName) {
			return fullName
		}
		if (username) {
			return username
		}
		return 'Unknown User'
	}

	async pingWaiterForReview(telegramBot: unknown, telegramUserId: string): Promise<void> {
		const miniAppUrl = this.configService.get<string>('MINIAPP_URL') || 'https://mini-app.birr-track.local'

		try {
			const typedBot = telegramBot as { telegram?: { sendMessage?: (id: string, msg: string, opts: unknown) => Promise<void> } }
			if (typedBot?.telegram?.sendMessage) {
				await typedBot.telegram.sendMessage(telegramUserId, '⚠️ 1 receipt needs your attention — open the app to fix it.', {
					reply_markup: {
						inline_keyboard: [[{ text: '📱 Open Mini App', web_app: { url: miniAppUrl } }]],
					},
				})
				this.logger.log(`Pinged waiter ${telegramUserId} for review`)
			}
		} catch (err) {
			this.logger.error(`Failed to ping waiter ${telegramUserId}: ${String(err)}`)
		}
	}
}
