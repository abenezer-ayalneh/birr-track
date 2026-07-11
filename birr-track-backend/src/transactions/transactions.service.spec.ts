/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { DataSource, Repository } from 'typeorm'

import { StorageService } from '../storage/storage.service'
import { CreateTransactionDto } from './dto/create-transaction.dto'
import { EditLog } from './entities/edit-log.entity'
import { Transaction } from './entities/transaction.entity'
import { TransactionsService } from './transactions.service'

describe('TransactionsService', () => {
	let service: TransactionsService
	let transactionRepository: Repository<Transaction>

	const mockTransaction: Transaction = {
		id: 'txn-1',
		telegramUserId: '123456789',
		telegramName: 'John Waiter',
		businessId: 'biz-1',
		userId: 'user-1',
		status: 'recorded',
		amount: '100.00',
		transactionId: 'ABC123',
		timestamp: new Date('2024-01-01T12:00:00Z'),
		bankName: 'CBE',
		confidence: 0.95,
		isDuplicate: false,
		editedByUploader: false,
		imageKey: 'receipts/biz-1/img-123',
		fileUniqueId: 'unique-123',
		createdAt: new Date(),
		business: null,
		user: null,
		editLogs: [],
	}

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				TransactionsService,
				{
					provide: getRepositoryToken(Transaction),
					useValue: {
						create: jest.fn(),
						save: jest.fn(),
						findOne: jest.fn(),
						remove: jest.fn(),
						createQueryBuilder: jest.fn(),
					},
				},
				{
					provide: getRepositoryToken(EditLog),
					useValue: {
						create: jest.fn(),
						save: jest.fn(),
					},
				},
				{
					provide: DataSource,
					useValue: {
						transaction: jest.fn(),
					},
				},
			],
		}).compile()

		service = module.get<TransactionsService>(TransactionsService)
		transactionRepository = module.get<Repository<Transaction>>(getRepositoryToken(Transaction))
	})

	describe('create', () => {
		it('should create a transaction with all fields present (recorded status)', async () => {
			const createDto: CreateTransactionDto = {
				telegramUserId: '123456789',
				telegramName: 'John Waiter',
				businessId: 'biz-1',
				userId: 'user-1',
				amount: 100.5,
				transactionId: 'ABC123',
				timestamp: '2024-01-01T12:00:00Z',
				bankName: 'CBE',
				confidence: 0.95,
				isDuplicate: false,
				imageKey: 'receipts/biz-1/img-123',
				fileUniqueId: 'unique-123',
			}

			jest.spyOn(transactionRepository, 'create').mockReturnValue(mockTransaction)
			jest.spyOn(transactionRepository, 'save').mockResolvedValue(mockTransaction)

			const result = await service.create(createDto, 'recorded')

			expect(transactionRepository.create).toHaveBeenCalledWith(
				expect.objectContaining({
					telegramUserId: '123456789',
					telegramName: 'John Waiter',
					businessId: 'biz-1',
					userId: 'user-1',
					amount: '100.50',
					status: 'recorded',
				}),
			)
			expect(result.status).toBe('recorded')
			expect(result).toEqual(mockTransaction)
		})

		it('should create a transaction with partial fields (needs_review status)', async () => {
			const partialTxn: Transaction = {
				...mockTransaction,
				status: 'needs_review',
				amount: null,
				transactionId: null,
			}

			const createDto: CreateTransactionDto = {
				telegramUserId: '123456789',
				telegramName: 'John Waiter',
				businessId: 'biz-1',
				userId: 'user-1',
				confidence: 0.5,
				isDuplicate: false,
				fileUniqueId: 'unique-456',
			}

			jest.spyOn(transactionRepository, 'create').mockReturnValue(partialTxn)
			jest.spyOn(transactionRepository, 'save').mockResolvedValue(partialTxn)

			const result = await service.create(createDto, 'needs_review')

			expect(result.status).toBe('needs_review')
			expect(result.amount).toBeNull()
			expect(result.transactionId).toBeNull()
		})

		it('should default to recorded status when not specified', async () => {
			jest.spyOn(transactionRepository, 'create').mockReturnValue(mockTransaction)
			jest.spyOn(transactionRepository, 'save').mockResolvedValue(mockTransaction)

			const createDto: CreateTransactionDto = {
				telegramUserId: '123456789',
				telegramName: 'John',
				businessId: 'biz-1',
				userId: 'user-1',
				amount: 50,
				transactionId: 'XYZ789',
				timestamp: '2024-01-02T12:00:00Z',
				bankName: 'CBE',
				confidence: 0.9,
				isDuplicate: false,
			}

			await service.create(createDto)

			expect(transactionRepository.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'recorded' }))
		})
	})

	describe('findDuplicate', () => {
		it('should find a duplicate scoped by businessId', async () => {
			jest.spyOn(transactionRepository, 'findOne').mockResolvedValue(mockTransaction)

			const result = await service.findDuplicate('biz-1', 'ABC123', 100.0, '2024-01-01T12:00:00Z')

			expect(transactionRepository.findOne).toHaveBeenCalledWith({
				where: {
					businessId: 'biz-1',
					transactionId: 'ABC123',
					amount: '100.00',
					timestamp: new Date('2024-01-01T12:00:00Z'),
				},
			})
			expect(result).toEqual(mockTransaction)
		})

		it('should not find duplicate from different business', async () => {
			jest.spyOn(transactionRepository, 'findOne').mockResolvedValue(null)

			const result = await service.findDuplicate('biz-2', 'ABC123', 100.0, '2024-01-01T12:00:00Z')

			expect(result).toBeNull()
		})

		it('should not find duplicate with different amount', async () => {
			jest.spyOn(transactionRepository, 'findOne').mockResolvedValue(null)

			const result = await service.findDuplicate('biz-1', 'ABC123', 200.0, '2024-01-01T12:00:00Z')

			expect(result).toBeNull()
		})
	})

	describe('repairIdempotentRedelivery', () => {
		it('should repair an unedited needs_review shell with extracted fields', async () => {
			const existing: Transaction = {
				...mockTransaction,
				status: 'needs_review',
				amount: null,
				transactionId: null,
				timestamp: null,
				bankName: null,
				confidence: 0,
				imageKey: null,
				fileUniqueId: 'unique-123',
				editedByUploader: false,
			}
			const repaired: Transaction = {
				...existing,
				status: 'recorded',
				amount: '9500.00',
				transactionId: 'FT1',
				timestamp: new Date('2026-07-09T00:00:00.000Z'),
				bankName: 'Commercial Bank of Ethiopia',
				confidence: 0.8,
				imageKey: 'receipts/2026/07/img.jpg',
			}
			jest.spyOn(transactionRepository, 'findOne').mockResolvedValue(existing)
			jest.spyOn(transactionRepository, 'create').mockReturnValue(repaired)
			jest.spyOn(transactionRepository, 'save').mockResolvedValue(repaired)

			const result = await service.repairIdempotentRedelivery(
				{
					telegramUserId: '123456789',
					telegramName: 'John Waiter',
					businessId: 'biz-1',
					userId: 'user-1',
					amount: 9500,
					transactionId: 'FT1',
					timestamp: '2026-07-09T00:00:00.000Z',
					bankName: 'Commercial Bank of Ethiopia',
					confidence: 0.8,
					isDuplicate: false,
					imageKey: 'receipts/2026/07/img.jpg',
					fileUniqueId: 'unique-123',
				},
				'recorded',
			)

			expect(transactionRepository.findOne).toHaveBeenCalledWith({ where: { businessId: 'biz-1', fileUniqueId: 'unique-123' } })
			expect(transactionRepository.create).toHaveBeenCalledWith(
				expect.objectContaining({
					id: existing.id,
					status: 'recorded',
					amount: '9500.00',
					transactionId: 'FT1',
					imageKey: 'receipts/2026/07/img.jpg',
				}),
			)
			expect(result).toEqual(repaired)
		})

		it('should preserve transactions already edited by the uploader', async () => {
			const edited = { ...mockTransaction, editedByUploader: true }
			jest.spyOn(transactionRepository, 'findOne').mockResolvedValue(edited)

			const result = await service.repairIdempotentRedelivery(
				{
					telegramUserId: '123456789',
					telegramName: 'John Waiter',
					businessId: 'biz-1',
					userId: 'user-1',
					amount: 9500,
					transactionId: 'FT1',
					timestamp: '2026-07-09T00:00:00.000Z',
					bankName: 'Commercial Bank of Ethiopia',
					confidence: 0.8,
					isDuplicate: false,
					fileUniqueId: 'unique-123',
				},
				'recorded',
			)

			expect(transactionRepository.save).not.toHaveBeenCalled()
			expect(result).toEqual(edited)
		})
	})

	describe('remove', () => {
		const waiterAuth = {
			userId: 'user-1',
			businessId: 'biz-1',
			role: 'waiter' as const,
			telegramUserId: '123456789',
			iat: 1,
			exp: 2,
		}
		const managerAuth = {
			...waiterAuth,
			userId: 'manager-1',
			role: 'manager' as const,
		}
		const storageService = {
			deleteObject: jest.fn(),
		} as unknown as StorageService

		beforeEach(() => {
			jest.spyOn(transactionRepository, 'remove').mockResolvedValue(mockTransaction)
			jest.spyOn(storageService, 'deleteObject').mockReset()
		})

		it('should delete a needs_review transaction within waiter scope', async () => {
			const needsReview = { ...mockTransaction, status: 'needs_review' as const }
			jest.spyOn(transactionRepository, 'findOne').mockResolvedValue(needsReview)
			jest.spyOn(storageService, 'deleteObject').mockResolvedValue(undefined)

			await service.remove(needsReview.id, waiterAuth, storageService)

			expect(transactionRepository.remove).toHaveBeenCalledWith(needsReview)
			expect(storageService.deleteObject).toHaveBeenCalledWith(needsReview.imageKey)
		})

		it('should let a manager delete a needs_review transaction in their business', async () => {
			const needsReview = { ...mockTransaction, status: 'needs_review' as const, userId: 'user-2' }
			jest.spyOn(transactionRepository, 'findOne').mockResolvedValue(needsReview)
			jest.spyOn(storageService, 'deleteObject').mockResolvedValue(undefined)

			await service.remove(needsReview.id, managerAuth, storageService)

			expect(transactionRepository.remove).toHaveBeenCalledWith(needsReview)
		})

		it('should reject waiter deletion of another waiter transaction', async () => {
			const needsReview = { ...mockTransaction, status: 'needs_review' as const, userId: 'user-2' }
			jest.spyOn(transactionRepository, 'findOne').mockResolvedValue(needsReview)

			await expect(service.remove(needsReview.id, waiterAuth, storageService)).rejects.toThrow(NotFoundException)
			expect(transactionRepository.remove).not.toHaveBeenCalled()
		})

		it('should reject recorded transaction deletion', async () => {
			jest.spyOn(transactionRepository, 'findOne').mockResolvedValue(mockTransaction)

			await expect(service.remove(mockTransaction.id, waiterAuth, storageService)).rejects.toThrow(ConflictException)
			expect(transactionRepository.remove).not.toHaveBeenCalled()
		})

		it('should return not found for a missing transaction', async () => {
			jest.spyOn(transactionRepository, 'findOne').mockResolvedValue(null)

			await expect(service.remove('missing', waiterAuth, storageService)).rejects.toThrow(NotFoundException)
			expect(transactionRepository.remove).not.toHaveBeenCalled()
		})

		it('should still delete the transaction when image cleanup fails', async () => {
			const needsReview = { ...mockTransaction, status: 'needs_review' as const }
			jest.spyOn(transactionRepository, 'findOne').mockResolvedValue(needsReview)
			jest.spyOn(storageService, 'deleteObject').mockRejectedValue(new Error('storage offline'))

			await service.remove(needsReview.id, waiterAuth, storageService)

			expect(transactionRepository.remove).toHaveBeenCalledWith(needsReview)
			expect(storageService.deleteObject).toHaveBeenCalledWith(needsReview.imageKey)
		})
	})
})
