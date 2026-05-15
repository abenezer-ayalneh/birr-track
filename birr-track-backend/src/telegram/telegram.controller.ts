import { Body, Controller, ForbiddenException, HttpCode, Param, Post } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpStatusCode } from 'axios'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'
import { Update } from 'telegraf/types'

import { TELEGRAM_BOT_NAME } from './telegram.constants'

@Controller('telegram')
export class TelegramController {
	constructor(
		private readonly configService: ConfigService,
		@InjectBot(TELEGRAM_BOT_NAME) private readonly telegramBot: Telegraf,
	) {}

	@HttpCode(HttpStatusCode.Ok)
	@Post('webhook/:secret')
	async handleWebhook(@Param('secret') secret: string, @Body() update: Update): Promise<{ ok: boolean }> {
		const expectedSecret = this.configService.get<string>('TELEGRAM_WEBHOOK_SECRET')
		if (expectedSecret && secret !== expectedSecret) {
			throw new ForbiddenException('Invalid Telegram webhook secret')
		}

		await this.telegramBot.handleUpdate(update)
		return { ok: true }
	}
}
