import { Injectable } from '@nestjs/common'
import { Ctx, On, Start, Update } from 'nestjs-telegraf'
import { Context } from 'telegraf'

import { TelegramService } from './telegram.service'

@Injectable()
@Update()
export class TelegramUpdateHandler {
	constructor(private readonly telegramService: TelegramService) {}

	@Start()
	async start(@Ctx() ctx: Context) {
		await ctx.reply('Welcome!')
	}

	@On('text')
	async handleText(@Ctx() context: Context): Promise<void> {
		await this.telegramService.handleTextMessage(context)
	}

	@On('photo')
	async handlePhoto(@Ctx() context: Context): Promise<void> {
		await this.telegramService.handlePhotoMessage(context)
	}

	/** `Composer.on('photo')` only matches `message`, not `edited_message` — cover caption/media edits. */
	@On('edited_message')
	async handleEditedMessage(@Ctx() context: Context): Promise<void> {
		const edited = context.editedMessage
		if (!edited || !('photo' in edited) || !edited.photo?.length) {
			return
		}
		await this.telegramService.handlePhotoMessage(context)
	}
}
