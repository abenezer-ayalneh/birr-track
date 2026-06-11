import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { StorageModule } from '../storage/storage.module'
import { TransactionsModule } from '../transactions/transactions.module'
import { WebsocketModule } from '../websocket/websocket.module'
import { ProcessingService } from './processing.service'
import { VlmService } from './vlm.service'

@Module({
	imports: [ConfigModule, StorageModule, TransactionsModule, WebsocketModule],
	providers: [VlmService, ProcessingService],
	exports: [ProcessingService],
})
export class ProcessingModule {}
