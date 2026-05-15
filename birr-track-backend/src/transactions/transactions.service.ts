import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Workbook } from 'exceljs'
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm'

import { CreateTransactionDto } from './dto/create-transaction.dto'
import { GetTransactionsQueryDto } from './dto/get-transactions-query.dto'
import { TransactionSummaryDto } from './dto/transaction-summary.dto'
import { UpdateTransactionDto } from './dto/update-transaction.dto'
import { EditLog } from './entities/edit-log.entity'
import { Transaction } from './entities/transaction.entity'

type EditableTransactionField = 'amount' | 'transactionId' | 'timestamp' | 'bankName' | 'confidence' | 'imageUrl'

type TransactionResponse = Omit<Transaction, 'amount'> & { amount: number }

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

	async create(createTransactionDto: CreateTransactionDto): Promise<Transaction> {
		const transaction = this.transactionRepository.create({
			...createTransactionDto,
			amount: createTransactionDto.amount.toFixed(2),
			timestamp: new Date(createTransactionDto.timestamp),
			imageUrl: createTransactionDto.imageUrl ?? null,
		})

		return this.transactionRepository.save(transaction)
	}

	async findDuplicate(transactionId: string, amount: number, timestamp: string): Promise<Transaction | null> {
		return this.transactionRepository.findOne({
			where: {
				transactionId,
				amount: amount.toFixed(2),
				timestamp: new Date(timestamp),
			},
		})
	}

	async findAll(queryDto: GetTransactionsQueryDto): Promise<{
		page: number
		limit: number
		total: number
		items: TransactionResponse[]
	}> {
		const page = queryDto.page
		const limit = queryDto.getEffectiveLimit()

		const query = this.buildFilteredQuery(queryDto)
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

	async getSummary(queryDto: GetTransactionsQueryDto): Promise<TransactionSummaryDto> {
		const query = this.buildFilteredQuery(queryDto)
		const aggregateResult = await query
			.select('COALESCE(SUM(transaction.amount), 0)', 'totalRevenue')
			.addSelect('COUNT(transaction.id)', 'transactionCount')
			.getRawOne<{ totalRevenue: string; transactionCount: string }>()

		return {
			totalRevenue: Number(aggregateResult?.totalRevenue ?? 0),
			transactionCount: Number(aggregateResult?.transactionCount ?? 0),
		}
	}

	async update(id: string, updateTransactionDto: UpdateTransactionDto, editedBy: string): Promise<TransactionResponse> {
		const existing = await this.transactionRepository.findOne({ where: { id } })
		if (!existing) {
			throw new NotFoundException(`Transaction ${id} not found`)
		}

		const fieldsToUpdate = this.getUpdateFields(updateTransactionDto)
		if (fieldsToUpdate.length === 0) {
			return this.toResponse(existing)
		}

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

	async export(queryDto: GetTransactionsQueryDto): Promise<Buffer> {
		const transactions = await this.buildFilteredQuery(queryDto).orderBy('transaction.createdAt', 'DESC').getMany()

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
			{ header: 'Image URL', key: 'imageUrl', width: 36 },
			{ header: 'Created At', key: 'createdAt', width: 28 },
		]

		transactions.forEach((item) => {
			worksheet.addRow({
				id: item.id,
				telegramUserId: item.telegramUserId,
				telegramName: item.telegramName,
				amount: Number(item.amount),
				transactionId: item.transactionId,
				timestamp: item.timestamp.toISOString(),
				bankName: item.bankName,
				confidence: item.confidence,
				isDuplicate: item.isDuplicate,
				imageUrl: item.imageUrl ?? '',
				createdAt: item.createdAt.toISOString(),
			})
		})

		return Buffer.from(await workbook.xlsx.writeBuffer())
	}

	private buildFilteredQuery(queryDto: GetTransactionsQueryDto): SelectQueryBuilder<Transaction> {
		const query = this.transactionRepository.createQueryBuilder('transaction')

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

		return query
	}

	private prepareUpdatePayload(updateDto: UpdateTransactionDto): Partial<Transaction> {
		return {
			amount: updateDto.amount === undefined ? undefined : updateDto.amount.toFixed(2),
			transactionId: updateDto.transactionId,
			timestamp: updateDto.timestamp === undefined ? undefined : new Date(updateDto.timestamp),
			bankName: updateDto.bankName,
			confidence: updateDto.confidence,
			imageUrl: updateDto.imageUrl,
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
		const candidates: EditableTransactionField[] = ['amount', 'transactionId', 'timestamp', 'bankName', 'confidence', 'imageUrl']

		return candidates.filter((field) => dto[field as keyof UpdateTransactionDto] !== undefined)
	}

	private toResponse(item: Transaction): TransactionResponse {
		return {
			...item,
			amount: Number(item.amount),
		}
	}
}
