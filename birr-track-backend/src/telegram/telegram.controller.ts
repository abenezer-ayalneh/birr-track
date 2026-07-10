import { timingSafeEqual } from 'node:crypto'

import { Body, Controller, Headers, HttpCode, Logger, Post, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpStatusCode } from 'axios'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'
import { Update } from 'telegraf/types'

import { DEFAULT_TELEGRAM_WEBHOOK_SECRET, TELEGRAM_BOT_NAME, TELEGRAM_SECRET_TOKEN_HEADER } from './telegram.constants'

@Controller('telegram')
export class TelegramController {
	private readonly logger = new Logger(TelegramController.name)

	constructor(
		private readonly configService: ConfigService,
		@InjectBot(TELEGRAM_BOT_NAME) private readonly telegramBot: Telegraf,
	) {}

	/** The `:secret` path segment is kept so previously registered webhook URLs keep resolving; the header is the gate. */
	@HttpCode(HttpStatusCode.Ok)
	@Post('webhook/:secret')
	async handleWebhook(@Headers(TELEGRAM_SECRET_TOKEN_HEADER) secretToken: string | undefined, @Body() update: Update): Promise<{ ok: boolean }> {
		const expectedSecret = this.configService.get<string>('TELEGRAM_WEBHOOK_SECRET')?.trim() || DEFAULT_TELEGRAM_WEBHOOK_SECRET

		if (!secretToken || !this.secretsMatch(secretToken, expectedSecret)) {
			throw new UnauthorizedException('Invalid Telegram webhook secret token')
		}

		this.logger.debug(`Telegram webhook update received: type=${this.describeUpdateType(update)}`)
		await this.telegramBot.handleUpdate(update)
		return { ok: true }
	}

	private describeUpdateType(update: Update): string {
		if ('message' in update && update.message) {
			const message = update.message
			if ('photo' in message) {
				return 'message.photo'
			}
			if ('document' in message) {
				return 'message.document'
			}
			if ('text' in message) {
				return 'message.text'
			}
			return 'message'
		}
		if ('edited_message' in update && update.edited_message) {
			return 'edited_message'
		}
		if ('callback_query' in update && update.callback_query) {
			return 'callback_query'
		}
		return 'unknown'
	}

	private secretsMatch(provided: string, expected: string): boolean {
		const providedBuffer = Buffer.from(provided)
		const expectedBuffer = Buffer.from(expected)
		return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer)
	}
}
