import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TelegrafModule } from 'nestjs-telegraf'

import { BusinessesModule } from '../businesses/businesses.module'
import { InvitesModule } from '../invites/invites.module'
import { QueueModule } from '../queue/queue.module'
import { RegistrationsModule } from '../registrations/registrations.module'
import { RateLimitModule } from '../shared/rate-limit/rate-limit.module'
import { UsersModule } from '../users/users.module'
import { ConversationService } from './flows/conversation.service'
import { ReceiptService } from './flows/receipt.service'
import { RegistrationService } from './flows/registration.service'
import { IdentityService } from './services/identity.service'
import { TELEGRAM_BOT_NAME } from './telegram.constants'
import { TelegramController } from './telegram.controller'
import { TelegramService } from './telegram.service'
import { TelegramUpdateHandler } from './telegram.update'

@Module({
	imports: [
		ConfigModule,
		QueueModule,
		RateLimitModule,
		UsersModule,
		BusinessesModule,
		InvitesModule,
		RegistrationsModule,
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
	providers: [TelegramService, TelegramUpdateHandler, IdentityService, ConversationService, ReceiptService, RegistrationService],
})
export class TelegramModule {}
