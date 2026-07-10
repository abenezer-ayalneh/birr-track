/* eslint-disable @typescript-eslint/unbound-method */
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'

import { ImageProcessingJobPayload } from '../queue/types/image-processing-job.type'
import { StorageService } from '../storage/storage.service'
import { Transaction } from '../transactions/entities/transaction.entity'
import { TransactionsService } from '../transactions/transactions.service'
import { User } from '../users/entities/user.entity'
import { UsersService } from '../users/users.service'
import { TransactionEventsGateway } from '../websocket/transaction-events.gateway'
import { ProcessingService } from './processing.service'
import { VlmService } from './vlm.service'

describe('ProcessingService', () => {
	let service: ProcessingService
	let vlmService: VlmService
	let storageService: StorageService
	let transactionsService: TransactionsService
	let usersService: UsersService
	let gateway: TransactionEventsGateway

	const mockUser: User = {
		id: 'user-1',
		telegramUserId: '123456789',
		displayName: 'John Waiter',
		businessId: 'biz-1',
		role: 'waiter',
		removedAt: null,
		createdAt: new Date(),
		business: null,
	}

	const mockJobPayload: ImageProcessingJobPayload = {
		telegramUserId: '123456789',
		telegramName: 'John Waiter',
		fileId: 'file-123',
		fileUniqueId: 'unique-123',
	}

	const mockExtractedData = {
		amount: 100.5,
		transactionId: 'ABC123',
		timestamp: '2024-01-01T12:00:00Z',
		bankName: 'CBE',
		currency: 'ETB',
		confidence: 0.95,
	}

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				ProcessingService,
				{
					provide: ConfigService,
					useValue: {
						get: jest.fn((key: string) => {
							if (key === 'TELEGRAM_BOT_TOKEN') return 'test-token-123'
							return undefined
						}),
					},
				},
				{
					provide: VlmService,
					useValue: {
						extract: jest.fn(),
					},
				},
				{
					provide: StorageService,
					useValue: {
						uploadReceiptImage: jest.fn(),
					},
				},
				{
					provide: TransactionsService,
					useValue: {
						create: jest.fn(),
						findDuplicate: jest.fn(),
						repairIdempotentRedelivery: jest.fn(),
					},
				},
				{
					provide: UsersService,
					useValue: {
						findByTelegramId: jest.fn(),
					},
				},
				{
					provide: TransactionEventsGateway,
					useValue: {
						emitTransactionNew: jest.fn(),
					},
				},
			],
		}).compile()

		service = module.get<ProcessingService>(ProcessingService)
		vlmService = module.get<VlmService>(VlmService)
		storageService = module.get<StorageService>(StorageService)
		transactionsService = module.get<TransactionsService>(TransactionsService)
		usersService = module.get<UsersService>(UsersService)
		gateway = module.get<TransactionEventsGateway>(TransactionEventsGateway)
	})

	describe('processImageJob', () => {
		beforeEach(() => {
			jest.spyOn(service as any, 'downloadTelegramFileFromUrl').mockResolvedValue(Buffer.from('test-image'))
			jest.spyOn(service as any, 'resolveTelegramFileDownloadUrl').mockResolvedValue('https://api.telegram.org/file/bot123/photos/test.jpg')
		})

		it('should create a recorded transaction when all VLM fields are complete', async () => {
			const mockTransaction: Transaction = {
				id: 'txn-1',
				telegramUserId: '123456789',
				telegramName: 'John Waiter',
				businessId: 'biz-1',
				userId: 'user-1',
				status: 'recorded',
				amount: '100.50',
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

			jest.spyOn(usersService, 'findByTelegramId').mockResolvedValue(mockUser)
			jest.spyOn(vlmService, 'extract').mockResolvedValue(mockExtractedData)
			jest.spyOn(storageService, 'uploadReceiptImage').mockResolvedValue('receipts/biz-1/img-123')
			jest.spyOn(transactionsService, 'findDuplicate').mockResolvedValue(null)
			jest.spyOn(transactionsService, 'create').mockResolvedValue(mockTransaction)

			await service.processImageJob(mockJobPayload)

			expect(transactionsService.create).toHaveBeenCalledWith(
				expect.objectContaining({
					businessId: 'biz-1',
					userId: 'user-1',
					amount: 100.5,
					transactionId: 'ABC123',
					fileUniqueId: 'unique-123',
				}),
				'recorded',
			)
			expect(gateway.emitTransactionNew).toHaveBeenCalledWith(expect.objectContaining({ status: 'recorded' }))
		})

		it('should create a needs_review transaction when VLM fields are incomplete', async () => {
			const incompleteData = {
				amount: null,
				transactionId: 'ABC123',
				timestamp: null,
				bankName: 'CBE',
				currency: null,
				confidence: 0.4,
			}

			const mockNeedsReviewTxn: Transaction = {
				id: 'txn-2',
				telegramUserId: '123456789',
				telegramName: 'John Waiter',
				businessId: 'biz-1',
				userId: 'user-1',
				status: 'needs_review',
				amount: null,
				transactionId: 'ABC123',
				timestamp: null,
				bankName: 'CBE',
				confidence: 0.4,
				isDuplicate: false,
				editedByUploader: false,
				imageKey: 'receipts/biz-1/img-123',
				fileUniqueId: 'unique-456',
				createdAt: new Date(),
				business: null,
				user: null,
				editLogs: [],
			}

			jest.spyOn(usersService, 'findByTelegramId').mockResolvedValue(mockUser)
			jest.spyOn(vlmService, 'extract').mockResolvedValue(incompleteData)
			jest.spyOn(storageService, 'uploadReceiptImage').mockResolvedValue('receipts/biz-1/img-123')
			jest.spyOn(transactionsService, 'create').mockResolvedValue(mockNeedsReviewTxn)

			await service.processImageJob(mockJobPayload)

			expect(transactionsService.create).toHaveBeenCalledWith(
				expect.objectContaining({
					amount: undefined,
					timestamp: undefined,
					fileUniqueId: 'unique-123',
				}),
				'needs_review',
			)
			expect(gateway.emitTransactionNew).toHaveBeenCalledWith(expect.objectContaining({ status: 'needs_review' }))
		})

		it('should mark as duplicate when matching transaction exists in same business', async () => {
			const existingDuplicate: Transaction = {
				id: 'txn-existing',
				telegramUserId: '123456788',
				telegramName: 'Another User',
				businessId: 'biz-1',
				userId: 'user-2',
				status: 'recorded',
				amount: '100.50',
				transactionId: 'ABC123',
				timestamp: new Date('2024-01-01T12:00:00Z'),
				bankName: 'CBE',
				confidence: 0.95,
				isDuplicate: false,
				editedByUploader: false,
				imageKey: 'receipts/biz-1/img-122',
				fileUniqueId: 'unique-122',
				createdAt: new Date(),
				business: null,
				user: null,
				editLogs: [],
			}

			const mockTransaction: Transaction = {
				id: 'txn-1',
				telegramUserId: '123456789',
				telegramName: 'John Waiter',
				businessId: 'biz-1',
				userId: 'user-1',
				status: 'recorded',
				amount: '100.50',
				transactionId: 'ABC123',
				timestamp: new Date('2024-01-01T12:00:00Z'),
				bankName: 'CBE',
				confidence: 0.95,
				isDuplicate: true,
				editedByUploader: false,
				imageKey: 'receipts/biz-1/img-123',
				fileUniqueId: 'unique-123',
				createdAt: new Date(),
				business: null,
				user: null,
				editLogs: [],
			}

			jest.spyOn(usersService, 'findByTelegramId').mockResolvedValue(mockUser)
			jest.spyOn(vlmService, 'extract').mockResolvedValue(mockExtractedData)
			jest.spyOn(storageService, 'uploadReceiptImage').mockResolvedValue('receipts/biz-1/img-123')
			jest.spyOn(transactionsService, 'findDuplicate').mockResolvedValue(existingDuplicate)
			jest.spyOn(transactionsService, 'create').mockResolvedValue(mockTransaction)

			await service.processImageJob(mockJobPayload)

			expect(transactionsService.create).toHaveBeenCalledWith(
				expect.objectContaining({
					isDuplicate: true,
				}),
				'recorded',
			)
		})

		it('should skip processing when user has no active business membership', async () => {
			jest.spyOn(usersService, 'findByTelegramId').mockResolvedValue(null)

			await service.processImageJob(mockJobPayload)

			expect(vlmService.extract).not.toHaveBeenCalled()
			expect(transactionsService.create).not.toHaveBeenCalled()
		})

		it('should create needs_review transaction when VLM service fails', async () => {
			const mockFailedTxn: Transaction = {
				id: 'txn-3',
				telegramUserId: '123456789',
				telegramName: 'John Waiter',
				businessId: 'biz-1',
				userId: 'user-1',
				status: 'needs_review',
				amount: null,
				transactionId: null,
				timestamp: null,
				bankName: null,
				confidence: 0,
				isDuplicate: false,
				editedByUploader: false,
				imageKey: 'receipts/biz-1/img-123',
				fileUniqueId: 'unique-123',
				createdAt: new Date(),
				business: null,
				user: null,
				editLogs: [],
			}

			jest.spyOn(usersService, 'findByTelegramId').mockResolvedValue(mockUser)
			jest.spyOn(vlmService, 'extract').mockRejectedValue(new Error('VLM service timeout'))
			jest.spyOn(storageService, 'uploadReceiptImage').mockResolvedValue('receipts/biz-1/img-123')
			jest.spyOn(transactionsService, 'create').mockResolvedValue(mockFailedTxn)

			await service.processImageJob(mockJobPayload)

			expect(transactionsService.create).toHaveBeenCalledWith(
				expect.objectContaining({
					amount: undefined,
					transactionId: undefined,
					confidence: 0,
				}),
				'needs_review',
			)
		})

		it('should detect idempotent redelivery on duplicate key error', async () => {
			const repairedTransaction: Transaction = {
				id: 'txn-existing',
				telegramUserId: '123456789',
				telegramName: 'John Waiter',
				businessId: 'biz-1',
				userId: 'user-1',
				status: 'recorded',
				amount: '100.50',
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
			jest.spyOn(usersService, 'findByTelegramId').mockResolvedValue(mockUser)
			jest.spyOn(vlmService, 'extract').mockResolvedValue(mockExtractedData)
			jest.spyOn(storageService, 'uploadReceiptImage').mockResolvedValue('receipts/biz-1/img-123')
			jest.spyOn(transactionsService, 'findDuplicate').mockResolvedValue(null)
			const duplicateKeyError = new Error('duplicate key value violates unique constraint "idx_transaction_idempotency"')
			jest.spyOn(transactionsService, 'create').mockRejectedValue(duplicateKeyError)
			jest.spyOn(transactionsService, 'repairIdempotentRedelivery').mockResolvedValue(repairedTransaction)

			await service.processImageJob(mockJobPayload)

			expect(transactionsService.create).toHaveBeenCalled()
			expect(transactionsService.repairIdempotentRedelivery).toHaveBeenCalledWith(
				expect.objectContaining({
					transactionId: 'ABC123',
					imageKey: 'receipts/biz-1/img-123',
					fileUniqueId: 'unique-123',
				}),
				'recorded',
			)
			expect(gateway.emitTransactionNew).toHaveBeenCalledWith(expect.objectContaining({ id: 'txn-existing', amount: 100.5 }))
		})
	})
})
