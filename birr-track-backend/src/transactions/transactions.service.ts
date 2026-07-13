import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Workbook } from 'exceljs'
import { Response } from 'express'
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm'

import { JwtPayload } from '../auth/auth.service'
import { StorageService } from '../storage/storage.service'
import { CreateTransactionDto } from './dto/create-transaction.dto'
import { GetTransactionsQueryDto } from './dto/get-transactions-query.dto'
import { TransactionSummaryDto } from './dto/transaction-summary.dto'
import { UpdateTransactionDto } from './dto/update-transaction.dto'
import { EditLog } from './entities/edit-log.entity'
import { Transaction } from './entities/transaction.entity'

type EditableTransactionField = 'amount' | 'transactionId' | 'timestamp' | 'bankName' | 'confidence' | 'imageKey'

type TransactionResponse = Omit<Transaction, 'amount'> & { amount: number | null }

@Injectable()
export class TransactionsService {
	private readonly logger = new Logger(TransactionsService.name)

	constructor(
		@InjectRepository(Transaction)
		private readonly transactionRepository: Repository<Transaction>,
		@InjectRepository(EditLog)
		private readonly editLogRepository: Repository<EditLog>,
		private readonly dataSource: DataSource,
	) {}

	async create(createTransactionDto: CreateTransactionDto, status: 'recorded' | 'needs_review' = 'recorded'): Promise<Transaction> {
		const transaction = this.transactionRepository.create({
			...createTransactionDto,
			amount: createTransactionDto.amount !== undefined ? createTransactionDto.amount.toFixed(2) : null,
			timestamp: createTransactionDto.timestamp !== undefined ? new Date(createTransactionDto.timestamp) : null,
			imageKey: createTransactionDto.imageKey ?? null,
			status,
		})

		return this.transactionRepository.save(transaction)
	}

	async findDuplicate(businessId: string, transactionId: string, amount: number, timestamp: string): Promise<Transaction | null> {
		return this.transactionRepository.findOne({
			where: {
				businessId,
				transactionId,
				amount: amount.toFixed(2),
				timestamp: new Date(timestamp),
			},
		})
	}

	async repairIdempotentRedelivery(createTransactionDto: CreateTransactionDto, status: 'recorded' | 'needs_review'): Promise<Transaction | null> {
		if (!createTransactionDto.businessId || !createTransactionDto.fileUniqueId) {
			return null
		}

		const existing = await this.transactionRepository.findOne({
			where: {
				businessId: createTransactionDto.businessId,
				fileUniqueId: createTransactionDto.fileUniqueId,
			},
		})
		if (!existing) {
			return null
		}

		if (existing.editedByUploader) {
			this.logger.log(`Idempotent redelivery found edited transaction ${existing.id}; preserving user edits`)
			return existing
		}

		const repaired = this.transactionRepository.create({
			...existing,
			telegramName: createTransactionDto.telegramName,
			userId: createTransactionDto.userId ?? existing.userId,
			amount: createTransactionDto.amount !== undefined ? createTransactionDto.amount.toFixed(2) : existing.amount,
			transactionId: createTransactionDto.transactionId ?? existing.transactionId,
			timestamp: createTransactionDto.timestamp !== undefined ? new Date(createTransactionDto.timestamp) : existing.timestamp,
			bankName: createTransactionDto.bankName ?? existing.bankName,
			confidence: createTransactionDto.confidence,
			isDuplicate: createTransactionDto.isDuplicate,
			imageKey: createTransactionDto.imageKey ?? existing.imageKey,
			status,
		})

		const saved = await this.transactionRepository.save(repaired)
		this.logger.log(`Repaired idempotent transaction ${saved.id} from redelivered file_unique_id`)
		return saved
	}

	async findAll(
		queryDto: GetTransactionsQueryDto,
		auth: JwtPayload,
	): Promise<{
		page: number
		limit: number
		total: number
		items: TransactionResponse[]
	}> {
		const page = queryDto.page
		const limit = queryDto.getEffectiveLimit()

		const query = this.buildFilteredQuery(queryDto, auth)
			.orderBy('transaction.createdAt', 'DESC')
			.skip((page - 1) * limit)
			.take(limit)

		const [items, total] = await query.getManyAndCount()
		return {
			page,
			limit,
			total,
			items: items.map((item) => this.toResponse(item)),
		}
	}

	async findById(id: string, auth: JwtPayload): Promise<TransactionResponse> {
		const query = this.transactionRepository.createQueryBuilder('transaction').where('transaction.id = :id', { id })
		this.applyAuthScope(query, auth)

		const transaction = await query.getOne()
		if (!transaction) {
			throw new NotFoundException(`Transaction ${id} not found`)
		}

		return this.toResponse(transaction)
	}

	async getSummary(queryDto: GetTransactionsQueryDto, auth: JwtPayload): Promise<TransactionSummaryDto> {
		const query = this.buildFilteredQuery(queryDto, auth)
		const aggregateResult = await query
			.select('COALESCE(SUM(transaction.amount), 0)', 'totalRevenue')
			.addSelect('COUNT(transaction.id)', 'transactionCount')
			.getRawOne<{ totalRevenue: string; transactionCount: string }>()

		const result: TransactionSummaryDto = {
			totalRevenue: Number(aggregateResult?.totalRevenue ?? 0),
			transactionCount: Number(aggregateResult?.transactionCount ?? 0),
		}

		// Add extended summaries only for manager+ roles
		if (auth.role !== 'waiter') {
			result.waiterBreakdown = await this.getWaiterBreakdown(queryDto, auth)
			result.bankBreakdown = await this.getBankBreakdown(queryDto, auth)
			result.attentionCounters = await this.getAttentionCounters(queryDto, auth)
		}

		return result
	}

	private async getWaiterBreakdown(
		queryDto: GetTransactionsQueryDto,
		auth: JwtPayload,
	): Promise<Array<{ userId: string; displayName: string; amount: number; count: number }>> {
		const query = this.buildFilteredQuery(queryDto, auth)
		const results = await query
			.select('transaction.userId', 'userId')
			.addSelect('user.displayName', 'displayName')
			.addSelect('COALESCE(SUM(transaction.amount), 0)', 'amount')
			.addSelect('COUNT(transaction.id)', 'count')
			.leftJoin('transaction.user', 'user')
			.groupBy('transaction.userId')
			.addGroupBy('user.displayName')
			.orderBy('amount', 'DESC')
			.getRawMany<{ userId: string | null; displayName: string | null; amount: string; count: string }>()

		return results
			.filter((r) => r.userId !== null)
			.map((r) => ({
				userId: r.userId,
				displayName: r.displayName ?? 'Unknown',
				amount: Number(r.amount ?? 0),
				count: Number(r.count ?? 0),
			}))
	}

	private async getBankBreakdown(queryDto: GetTransactionsQueryDto, auth: JwtPayload): Promise<Array<{ bankName: string; amount: number; count: number }>> {
		const query = this.buildFilteredQuery(queryDto, auth)
		const results = await query
			.select('transaction.bankName', 'bankName')
			.addSelect('COALESCE(SUM(transaction.amount), 0)', 'amount')
			.addSelect('COUNT(transaction.id)', 'count')
			.groupBy('transaction.bankName')
			.orderBy('amount', 'DESC')
			.getRawMany<{ bankName: string | null; amount: string; count: string }>()

		return results
			.filter((r) => r.bankName !== null)
			.map((r) => ({
				bankName: r.bankName,
				amount: Number(r.amount ?? 0),
				count: Number(r.count ?? 0),
			}))
	}

	private async getAttentionCounters(
		queryDto: GetTransactionsQueryDto,
		auth: JwtPayload,
	): Promise<{ needsReview: number; duplicates: number; editedByUploader: number }> {
		const query = this.buildFilteredQuery(queryDto, auth)
		const clonedQuery = this.buildFilteredQuery(queryDto, auth)
		const clonedQuery2 = this.buildFilteredQuery(queryDto, auth)

		const needsReviewResult = await query
			.andWhere('transaction.status = :status', { status: 'needs_review' })
			.select('COUNT(transaction.id)', 'count')
			.getRawOne<{ count: string }>()

		const duplicatesResult = await clonedQuery
			.andWhere('transaction.isDuplicate = :isDuplicate', { isDuplicate: true })
			.select('COUNT(transaction.id)', 'count')
			.getRawOne<{ count: string }>()

		const editedResult = await clonedQuery2
			.andWhere('transaction.editedByUploader = :editedByUploader', { editedByUploader: true })
			.select('COUNT(transaction.id)', 'count')
			.getRawOne<{ count: string }>()

		return {
			needsReview: Number(needsReviewResult?.count ?? 0),
			duplicates: Number(duplicatesResult?.count ?? 0),
			editedByUploader: Number(editedResult?.count ?? 0),
		}
	}

	async update(id: string, updateTransactionDto: UpdateTransactionDto, auth: JwtPayload): Promise<TransactionResponse> {
		const existing = await this.transactionRepository.findOne({ where: { id } })
		if (!existing) {
			throw new NotFoundException(`Transaction ${id} not found`)
		}

		// Verify access
		this.verifyTransactionAccess(existing, auth)

		const fieldsToUpdate = this.getUpdateFields(updateTransactionDto)
		if (fieldsToUpdate.length === 0) {
			return this.toResponse(existing)
		}

		const editedBy = auth.userId ?? 'system'

		const updated = await this.dataSource.transaction(async (manager) => {
			for (const field of fieldsToUpdate) {
				const oldValue = this.readFieldValue(existing, field)
				const newValue = this.readFieldValue(updateTransactionDto, field)
				if (oldValue === newValue) {
					continue
				}

				await manager.getRepository(EditLog).save(
					this.editLogRepository.create({
						transactionId: existing.id,
						fieldName: field,
						oldValue,
						newValue,
						editedBy,
					}),
				)
			}

			const preparedUpdate = this.prepareUpdatePayload(updateTransactionDto)
			await manager.getRepository(Transaction).update(existing.id, preparedUpdate)

			const saved = await manager.getRepository(Transaction).findOne({ where: { id: existing.id } })

			if (!saved) {
				throw new NotFoundException(`Transaction ${id} not found after update`)
			}

			return saved
		})

		this.logger.log(`Transaction ${id} updated by ${editedBy}`)
		return this.toResponse(updated)
	}

	async remove(id: string, auth: JwtPayload, storageService: StorageService): Promise<void> {
		const existing = await this.transactionRepository.findOne({ where: { id } })
		if (!existing) {
			throw new NotFoundException(`Transaction ${id} not found`)
		}

		this.verifyTransactionAccess(existing, auth)

		if (existing.status !== 'needs_review') {
			throw new ConflictException('Only Needs Review transactions can be deleted')
		}

		await this.transactionRepository.remove(existing)

		if (!existing.imageKey) {
			return
		}

		try {
			await storageService.deleteObject(existing.imageKey)
		} catch (error) {
			this.logger.warn(`Failed to delete image for transaction ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
		}
	}

	async export(queryDto: GetTransactionsQueryDto, auth: JwtPayload): Promise<Buffer> {
		const transactions = await this.buildFilteredQuery(queryDto, auth).orderBy('transaction.createdAt', 'DESC').getMany()

		const workbook = new Workbook()
		const worksheet = workbook.addWorksheet('Transactions')
		worksheet.columns = [
			{ header: 'ID', key: 'id', width: 38 },
			{ header: 'Telegram User ID', key: 'telegramUserId', width: 20 },
			{ header: 'Telegram name', key: 'telegramName', width: 28 },
			{ header: 'Amount', key: 'amount', width: 16 },
			{ header: 'Transaction ID', key: 'transactionId', width: 24 },
			{ header: 'Timestamp', key: 'timestamp', width: 28 },
			{ header: 'Bank Name', key: 'bankName', width: 20 },
			{ header: 'Confidence', key: 'confidence', width: 14 },
			{ header: 'Is Duplicate', key: 'isDuplicate', width: 16 },
			{ header: 'Image Key', key: 'imageKey', width: 36 },
			{ header: 'Created At', key: 'createdAt', width: 28 },
		]

		transactions.forEach((item) => {
			worksheet.addRow({
				id: item.id,
				telegramUserId: item.telegramUserId,
				telegramName: item.telegramName,
				amount: item.amount ? Number(item.amount) : '',
				transactionId: item.transactionId ?? '',
				timestamp: item.timestamp ? item.timestamp.toISOString() : '',
				bankName: item.bankName ?? '',
				confidence: item.confidence,
				isDuplicate: item.isDuplicate,
				imageKey: item.imageKey ?? '',
				createdAt: item.createdAt.toISOString(),
			})
		})

		return Buffer.from(await workbook.xlsx.writeBuffer())
	}

	private buildFilteredQuery(queryDto: GetTransactionsQueryDto, auth: JwtPayload): SelectQueryBuilder<Transaction> {
		const query = this.transactionRepository.createQueryBuilder('transaction')

		this.applyAuthScope(query, auth)

		if (queryDto.startDate) {
			query.andWhere('transaction.timestamp >= :startDate', {
				startDate: new Date(queryDto.startDate),
			})
		}

		if (queryDto.endDate) {
			query.andWhere('transaction.timestamp <= :endDate', {
				endDate: new Date(queryDto.endDate),
			})
		}

		if (queryDto.telegramUserId) {
			query.andWhere('transaction.telegramUserId = :telegramUserId', {
				telegramUserId: queryDto.telegramUserId,
			})
		}

		if (queryDto.status) {
			query.andWhere('transaction.status = :status', { status: queryDto.status })
		}

		if (queryDto.bank) {
			query.andWhere('transaction.bankName = :bank', { bank: queryDto.bank })
		}

		if (queryDto.duplicate) {
			query.andWhere('transaction.isDuplicate = :isDuplicate', { isDuplicate: true })
		}

		if (queryDto.edited) {
			query.andWhere('transaction.editedByUploader = :editedByUploader', { editedByUploader: true })
		}

		return query
	}

	private applyAuthScope(query: SelectQueryBuilder<Transaction>, auth: JwtPayload): void {
		if (auth.role === 'platform_owner') {
			return // Platform owner sees all
		}

		if (!auth.businessId) {
			// Shouldn't happen due to controller validation, but be defensive
			query.andWhere('1=0') // Return no results
			return
		}

		query.andWhere('transaction.businessId = :businessId', { businessId: auth.businessId })

		// Waiters see only their own transactions
		if (auth.role === 'waiter' && auth.userId) {
			query.andWhere('transaction.userId = :userId', { userId: auth.userId })
		}
	}

	private verifyTransactionAccess(transaction: Transaction, auth: JwtPayload): void {
		if (auth.role === 'platform_owner') {
			return // Platform owner can edit all
		}

		if (auth.role === 'waiter') {
			// Waiters can only edit their own
			if (transaction.userId !== auth.userId) {
				throw new NotFoundException(`Transaction not found`)
			}
			return
		}

		// Managers and owners can edit within their business
		if (transaction.businessId !== auth.businessId) {
			throw new NotFoundException(`Transaction not found`)
		}
	}

	private prepareUpdatePayload(updateDto: UpdateTransactionDto): Partial<Transaction> {
		return {
			amount: updateDto.amount === undefined ? undefined : updateDto.amount.toFixed(2),
			transactionId: updateDto.transactionId,
			timestamp: updateDto.timestamp === undefined ? undefined : new Date(updateDto.timestamp),
			bankName: updateDto.bankName,
			confidence: updateDto.confidence,
			imageKey: updateDto.imageKey,
		}
	}

	private readFieldValue(source: Partial<Transaction> | UpdateTransactionDto, field: EditableTransactionField): string | null {
		const value = source[field as keyof typeof source]
		if (value === undefined || value === null) {
			return null
		}
		if (value instanceof Date) {
			return value.toISOString()
		}
		return String(value)
	}

	private getUpdateFields(dto: UpdateTransactionDto): EditableTransactionField[] {
		const candidates: EditableTransactionField[] = ['amount', 'transactionId', 'timestamp', 'bankName', 'confidence', 'imageKey']

		return candidates.filter((field) => dto[field as keyof UpdateTransactionDto] !== undefined)
	}

	private toResponse(item: Transaction): TransactionResponse {
		return {
			...item,
			amount: item.amount ? Number(item.amount) : null,
		}
	}

	async streamImage(id: string, auth: JwtPayload, response: Response, storageService: StorageService): Promise<void> {
		const transaction = await this.transactionRepository.findOne({ where: { id } })
		if (!transaction) {
			throw new NotFoundException(`Transaction ${id} not found`)
		}

		// Verify access
		this.verifyTransactionAccess(transaction, auth)

		if (!transaction.imageKey) {
			throw new NotFoundException(`No image available for transaction ${id}`)
		}

		try {
			const stream = await storageService.getObjectStream(transaction.imageKey)
			response.setHeader('Content-Type', 'image/jpeg')
			response.setHeader('Content-Disposition', `inline; filename="receipt-${id}.jpg"`)
			stream.pipe(response)
		} catch (error) {
			this.logger.error(`Failed to stream image for transaction ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
			throw new NotFoundException(`Image not found for transaction ${id}`)
		}
	}
}
