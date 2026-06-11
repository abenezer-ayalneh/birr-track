import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, StreamableFile } from '@nestjs/common'
import { Response } from 'express'

import { JwtPayload } from '../auth/auth.service'
import { AuthUserPayload } from '../auth/decorators/auth-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { StorageService } from '../storage/storage.service'
import { EXCEL_CONTENT_TYPE, EXCEL_FILE_PREFIX } from './constants/transaction.constants'
import { CreateTransactionDto } from './dto/create-transaction.dto'
import { GetTransactionsQueryDto } from './dto/get-transactions-query.dto'
import { TransactionSummaryDto } from './dto/transaction-summary.dto'
import { UpdateTransactionDto } from './dto/update-transaction.dto'
import { TransactionsService } from './transactions.service'

@Controller('transactions')
export class TransactionsController {
	constructor(
		private readonly transactionsService: TransactionsService,
		private readonly storageService: StorageService,
	) {}

	@Get()
	async getTransactions(@Query() queryDto: GetTransactionsQueryDto, @AuthUserPayload() auth: JwtPayload) {
		this.validateBusinessAccess(auth)
		return this.transactionsService.findAll(queryDto, auth)
	}

	@Get('summary')
	@Roles('manager', 'owner', 'platform_owner')
	async getSummary(@Query() queryDto: GetTransactionsQueryDto, @AuthUserPayload() auth: JwtPayload): Promise<TransactionSummaryDto> {
		this.validateManagerAccess(auth)
		return this.transactionsService.getSummary(queryDto, auth)
	}

	@Get('export')
	@Roles('manager', 'owner', 'platform_owner')
	async exportTransactions(
		@Query() queryDto: GetTransactionsQueryDto,
		@AuthUserPayload() auth: JwtPayload,
		@Res({ passthrough: true }) response: Response,
	): Promise<StreamableFile> {
		this.validateManagerAccess(auth)
		const buffer = await this.transactionsService.export(queryDto, auth)
		const fileName = `${EXCEL_FILE_PREFIX}-${Date.now()}.xlsx`
		response.setHeader('Content-Type', EXCEL_CONTENT_TYPE)
		response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
		return new StreamableFile(buffer)
	}

	@Get(':id')
	async getTransaction(@Param('id', ParseUUIDPipe) id: string, @AuthUserPayload() auth: JwtPayload) {
		this.validateBusinessAccess(auth)
		return this.transactionsService.findById(id, auth)
	}

	@Get(':id/image')
	async getTransactionImage(@Param('id', ParseUUIDPipe) id: string, @AuthUserPayload() auth: JwtPayload, @Res() response: Response): Promise<void> {
		this.validateBusinessAccess(auth)
		return this.transactionsService.streamImage(id, auth, response, this.storageService)
	}

	@Patch(':id')
	async updateTransaction(@Param('id', ParseUUIDPipe) id: string, @Body() updateTransactionDto: UpdateTransactionDto, @AuthUserPayload() auth: JwtPayload) {
		this.validateBusinessAccess(auth)
		return this.transactionsService.update(id, updateTransactionDto, auth)
	}

	@Post()
	@Roles('platform_owner')
	createForInternalTesting(@Body() createTransactionDto: CreateTransactionDto) {
		return this.transactionsService.create(createTransactionDto)
	}

	private validateBusinessAccess(auth: JwtPayload): void {
		if (auth.role === 'platform_owner') {
			return // Platform owner can access all
		}
		if (!auth.businessId) {
			throw new ForbiddenException('User not assigned to a business')
		}
	}

	private validateManagerAccess(auth: JwtPayload): void {
		if (auth.role === 'platform_owner') {
			return // Platform owner can access all
		}
		if (auth.role === 'waiter') {
			throw new ForbiddenException('Waiters cannot access this endpoint')
		}
		if (!auth.businessId) {
			throw new ForbiddenException('User not assigned to a business')
		}
	}
}
