import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Ctx, On, Update } from 'nestjs-telegraf'
import { Message } from 'telegraf/types'

import { QueueService } from '../../queue/queue.service'
import { RateLimitService } from '../../shared/rate-limit/rate-limit.service'
import { describeError } from '../../shared/utils/describe-error.util'
import { SupportedLanguage } from '../../users/entities/user.entity'
import { IdentifiedContext } from '../services/identity.service'
import { PHOTO_RATE_LIMIT_KEY_PREFIX } from '../telegram.constants'
import { botText, formatBotText, isSupportedLanguage } from '../telegram.i18n'

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

	@On('message')
	async handlePhoto(@Ctx() ctx: IdentifiedContext): Promise<void> {
		const message = ctx.message as Partial<Message.PhotoMessage> | undefined
		await this.processPhotoMessage(ctx, message)
	}

	@On('edited_message')
	async handleEditedMessage(@Ctx() ctx: IdentifiedContext): Promise<void> {
		const edited = ctx.editedMessage as Partial<Message.PhotoMessage> | undefined
		await this.processPhotoMessage(ctx, edited)
	}

	private async processPhotoMessage(ctx: IdentifiedContext, message: Partial<Message.PhotoMessage> | undefined): Promise<void> {
		this.logger.debug(
			`Receipt message received: hasPhoto=${Boolean(message?.photo?.length)}, photoSizes=${message?.photo?.length ?? 0}, hasFrom=${Boolean(ctx.from?.id)}`,
		)

		if (!message || !message.photo || !message.photo.length || !ctx.from?.id) {
			return
		}

		const telegramUserId = String(ctx.from.id)
		const t = botText(this.getLanguage(ctx))

		if (!ctx.state.user) {
			await ctx.reply(t.unknownPhotoUser)
			this.logger.log(`Rejected photo from unknown user ${telegramUserId}`)
			return
		}

		if (ctx.state.business?.status === 'suspended') {
			await ctx.reply(t.suspendedBusiness)
			this.logger.warn(`Rejected photo from suspended business user ${telegramUserId}`)
			return
		}

		if (ctx.state.business?.status !== 'active') {
			await ctx.reply(t.pendingBusiness)
			this.logger.log(`Rejected photo from pending business user ${telegramUserId}`)
			return
		}

		const limit = Number(this.configService.get<string>('TELEGRAM_PHOTO_RATE_LIMIT', `${DEFAULT_PHOTO_RATE_LIMIT}`))
		const windowSeconds = Number(this.configService.get<string>('TELEGRAM_PHOTO_RATE_WINDOW_SECONDS', `${DEFAULT_PHOTO_RATE_WINDOW_SECONDS}`))

		const result = await this.rateLimitService.consume(`${PHOTO_RATE_LIMIT_KEY_PREFIX}${telegramUserId}`, limit, windowSeconds)
		if (!result.allowed) {
			this.logger.warn(`Throttled photo from user ${telegramUserId} (${result.count} in current window, limit ${limit})`)
			if (result.count === limit + 1) {
				await ctx.reply(t.throttled)
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
			fileUniqueId: selectedPhoto.file_unique_id,
			businessId: ctx.state.business.id,
			userId: ctx.state.user.id,
		})

		this.logger.log(`Queued photo for user ${telegramUserId}, business ${ctx.state.business.id}`)

		await this.sendMediaGroupAck(ctx, message.media_group_id)
	}

	private async sendMediaGroupAck(ctx: IdentifiedContext, mediaGroupId?: string): Promise<void> {
		const t = botText(this.getLanguage(ctx))
		if (!mediaGroupId) {
			await ctx.reply(t.receivedOne)
			return
		}

		const key = `${ctx.chat?.id}-${mediaGroupId}`
		const existing = this.mediaGroupAcks.get(key)

		if (existing) {
			existing.count++
		} else {
			const newAck = {
				count: 1,
				chatId: ctx.chat?.id || 0,
				timeout: setTimeout(() => {
					const count = newAck.count
					ctx.reply(formatBotText(t.receivedMany, { count })).catch((err) => {
						this.logger.error(`Failed to send media group ack: ${describeError(err)}`)
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
		const miniAppUrl = this.configService.get<string>('FRONTEND_APP_URL', 'http://localhost:3003')

		try {
			const typedBot = telegramBot as { telegram?: { sendMessage?: (id: string, msg: string, opts: unknown) => Promise<void> } }
			if (typedBot?.telegram?.sendMessage) {
				await typedBot.telegram.sendMessage(telegramUserId, botText('en').reviewPing, {
					reply_markup: {
						inline_keyboard: [[{ text: `📱 ${botText('en').openMiniApp}`, web_app: { url: miniAppUrl } }]],
					},
				})
				this.logger.log(`Pinged waiter ${telegramUserId} for review`)
			}
		} catch (err) {
			this.logger.error(`Failed to ping waiter ${telegramUserId}: ${describeError(err)}`)
		}
	}

	private getLanguage(ctx: IdentifiedContext): SupportedLanguage {
		const sessionLanguage = ctx.session?.language
		if (isSupportedLanguage(sessionLanguage)) {
			return sessionLanguage
		}
		return ctx.state.user?.language || 'en'
	}
}
