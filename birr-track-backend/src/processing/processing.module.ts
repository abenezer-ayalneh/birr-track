import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { TransactionsModule } from '../transactions/transactions.module'
import { WebsocketModule } from '../websocket/websocket.module'
import { ProcessingService } from './processing.service'
import { VlmService } from './vlm.service'

@Module({
	imports: [ConfigModule, TransactionsModule, WebsocketModule],
	providers: [VlmService, ProcessingService],
	exports: [ProcessingService],
})
export class ProcessingModule {}
