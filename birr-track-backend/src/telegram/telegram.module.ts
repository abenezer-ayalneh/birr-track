import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TelegrafModule } from 'nestjs-telegraf'

import { QueueModule } from '../queue/queue.module'
import { TELEGRAM_BOT_NAME } from './telegram.constants'
import { TelegramController } from './telegram.controller'
import { TelegramService } from './telegram.service'
import { TelegramUpdateHandler } from './telegram.update'

@Module({
	imports: [
		ConfigModule,
		QueueModule,
		TelegrafModule.forRootAsync({
			imports: [ConfigModule],
			botName: TELEGRAM_BOT_NAME,
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => {
				const token = configService.get<string>('TELEGRAM_BOT_TOKEN')
				if (!token) {
					throw new Error('TELEGRAM_BOT_TOKEN is required')
				}

				return {
					token,
					launchOptions: false,
				}
			},
		}),
	],
	controllers: [TelegramController],
	providers: [TelegramService, TelegramUpdateHandler],
})
export class TelegramModule {}
