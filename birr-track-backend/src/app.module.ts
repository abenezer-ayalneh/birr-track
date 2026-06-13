import { Logger, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { ThrottlerModule } from '@nestjs/throttler'
import { TypeOrmModule } from '@nestjs/typeorm'

import AppController from './app.controller'
import AppService from './app.service'
import { AuthModule } from './auth/auth.module'
import { OptionalJwtAuthGuard } from './auth/guards/optional-jwt-auth.guard'
import { RolesGuard } from './auth/guards/roles.guard'
import { BusinessesModule } from './businesses/businesses.module'
import { createTypeOrmConfig } from './config/typeorm.config'
import { InvitesModule } from './invites/invites.module'
import { ProcessingModule } from './processing/processing.module'
import { QueueModule } from './queue/queue.module'
import { RegistrationsModule } from './registrations/registrations.module'
import GlobalExceptionFilter from './shared/filters/global-exception.filter'
import { ContextAwareThrottlerGuard } from './shared/guards/context-aware-throttler.guard'
import { TelegramModule } from './telegram/telegram.module'
import { TransactionsModule } from './transactions/transactions.module'
import { UsersModule } from './users/users.module'
import { WebsocketModule } from './websocket/websocket.module'
import { join } from 'node:path'

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true, expandVariables: true, envFilePath: [join(__dirname, '..', '..', '..', '.env'), '.env'] }),
		ThrottlerModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (config: ConfigService) => [
				{
					ttl: config.get('THROTTLER_TTL'), // The number of milliseconds that each request will last in storage
					limit: config.get('THROTTLER_LIMIT'), // The maximum number of requests within the TTL limit
				},
			],
		}),
		TypeOrmModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => createTypeOrmConfig(configService),
		}),
		AuthModule,
		TelegramModule,
		QueueModule,
		ProcessingModule,
		TransactionsModule,
		BusinessesModule,
		UsersModule,
		InvitesModule,
		RegistrationsModule,
		WebsocketModule,
	],
	controllers: [AppController],
	providers: [
		AppService,
		Logger,
		{
			provide: APP_GUARD,
			useClass: ContextAwareThrottlerGuard,
		},
		{
			provide: APP_GUARD,
			useClass: OptionalJwtAuthGuard,
		},
		{
			provide: APP_GUARD,
			useClass: RolesGuard,
		},
		{ provide: APP_FILTER, useClass: GlobalExceptionFilter },
	],
})
export default class AppModule {}
