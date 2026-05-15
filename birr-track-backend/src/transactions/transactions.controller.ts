import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, Res, StreamableFile } from '@nestjs/common'
import { Response } from 'express'

import { EXCEL_CONTENT_TYPE, EXCEL_FILE_PREFIX } from './constants/transaction.constants'
import { CreateTransactionDto } from './dto/create-transaction.dto'
import { GetTransactionsQueryDto } from './dto/get-transactions-query.dto'
import { TransactionSummaryDto } from './dto/transaction-summary.dto'
import { UpdateTransactionDto } from './dto/update-transaction.dto'
import { TransactionsService } from './transactions.service'

const DEFAULT_EDITOR = 'system'

@Controller('transactions')
export class TransactionsController {
	constructor(private readonly transactionsService: TransactionsService) {}

	@Get()
	getTransactions(@Query() queryDto: GetTransactionsQueryDto) {
		return this.transactionsService.findAll(queryDto)
	}

	@Get('summary')
	getSummary(@Query() queryDto: GetTransactionsQueryDto): Promise<TransactionSummaryDto> {
		return this.transactionsService.getSummary(queryDto)
	}

	@Get('export')
	async exportTransactions(@Query() queryDto: GetTransactionsQueryDto, @Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
		const buffer = await this.transactionsService.export(queryDto)
		const fileName = `${EXCEL_FILE_PREFIX}-${Date.now()}.xlsx`
		response.setHeader('Content-Type', EXCEL_CONTENT_TYPE)
		response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
		return new StreamableFile(buffer)
	}

	@Patch(':id')
	updateTransaction(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() updateTransactionDto: UpdateTransactionDto,
		@Headers('x-editor') editedByHeader?: string,
	) {
		const editedBy = editedByHeader?.trim() || DEFAULT_EDITOR
		return this.transactionsService.update(id, updateTransactionDto, editedBy)
	}

	@Post()
	createForInternalTesting(@Body() createTransactionDto: CreateTransactionDto) {
		return this.transactionsService.create(createTransactionDto)
	}
}
