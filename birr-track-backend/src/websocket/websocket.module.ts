import { Module } from '@nestjs/common'

import { TransactionEventsGateway } from './transaction-events.gateway'

@Module({
	providers: [TransactionEventsGateway],
	exports: [TransactionEventsGateway],
})
export class WebsocketModule {}
