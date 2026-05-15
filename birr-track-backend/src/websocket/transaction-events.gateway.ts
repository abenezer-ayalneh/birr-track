import { Logger } from '@nestjs/common'
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets'
import { Server } from 'socket.io'

@WebSocketGateway({
	cors: {
		origin: '*',
	},
})
export class TransactionEventsGateway {
	private readonly logger = new Logger(TransactionEventsGateway.name)

	@WebSocketServer()
	server!: Server

	emitTransactionNew(payload: unknown): void {
		this.server.emit('transaction:new', payload)
		this.logger.debug('Emitted transaction:new event')
	}
}
