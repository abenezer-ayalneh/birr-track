import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { TelegramLinksService } from './services/telegram-links.service'

@Module({
	imports: [ConfigModule],
	providers: [TelegramLinksService],
	exports: [TelegramLinksService],
})
export class TelegramPresentationModule {}
