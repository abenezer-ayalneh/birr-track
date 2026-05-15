import { Logger, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { ThrottlerModule } from '@nestjs/throttler'
import { TypeOrmModule } from '@nestjs/typeorm'

import AppController from './app.controller'
import AppService from './app.service'
import { BusinessesModule } from './businesses/businesses.module'
import { createTypeOrmConfig } from './config/typeorm.config'
import { ProcessingModule } from './processing/processing.module'
import { QueueModule } from './queue/queue.module'
import GlobalExceptionFilter from './shared/filters/global-exception.filter'
import { ContextAwareThrottlerGuard } from './shared/guards/context-aware-throttler.guard'
import { TelegramModule } from './telegram/telegram.module'
import { TransactionsModule } from './transactions/transactions.module'
import { WebsocketModule } from './websocket/websocket.module'

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true, expandVariables: true }),
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
		TelegramModule,
		QueueModule,
		ProcessingModule,
		TransactionsModule,
		BusinessesModule,
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
		{ provide: APP_FILTER, useClass: GlobalExceptionFilter },
	],
})
export default class AppModule {}
