import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { EditLog } from './entities/edit-log.entity'
import { Transaction } from './entities/transaction.entity'
import { TransactionsController } from './transactions.controller'
import { TransactionsService } from './transactions.service'

@Module({
	imports: [TypeOrmModule.forFeature([Transaction, EditLog])],
	controllers: [TransactionsController],
	providers: [TransactionsService],
	exports: [TypeOrmModule, TransactionsService],
})
export class TransactionsModule {}
