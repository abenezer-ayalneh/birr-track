/* eslint-disable @typescript-eslint/unbound-method */
import { ConfigService } from '@nestjs/config'

import { Business } from '../../businesses/entities/business.entity'
import { QueueService } from '../../queue/queue.service'
import { RateLimitService } from '../../shared/rate-limit/rate-limit.service'
import { User } from '../../users/entities/user.entity'
import { IdentifiedContext } from '../services/identity.service'
import { ReceiptService } from './receipt.service'

describe('ReceiptService', () => {
	function buildService() {
		const configService = {
			get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue),
		} as unknown as jest.Mocked<Pick<ConfigService, 'get'>>
		const queueService = {
			enqueueImageProcessingJob: jest.fn().mockResolvedValue(undefined),
		} as unknown as jest.Mocked<Pick<QueueService, 'enqueueImageProcessingJob'>>
		const rateLimitService = {
			consume: jest.fn().mockResolvedValue({ allowed: true, count: 1 }),
		} as unknown as jest.Mocked<Pick<RateLimitService, 'consume'>>

		return {
			configService,
			queueService,
			rateLimitService,
			service: new ReceiptService(configService as unknown as ConfigService, queueService as unknown as QueueService, rateLimitService as unknown as RateLimitService),
		}
	}

	function buildContext(overrides: Partial<IdentifiedContext> = {}) {
		const user = {
			id: 'user-1',
			telegramUserId: '4242',
			displayName: 'Abebe',
			businessId: 'business-1',
			role: 'waiter',
			language: 'en',
		} as User
		const business = {
			id: 'business-1',
			name: 'Cafe Addis',
			status: 'active',
		} as Business

		return {
			from: { id: 4242, first_name: 'Abe', last_name: 'Bekele', username: 'abe' },
			chat: { id: 777 },
			message: {
				photo: [
					{ file_id: 'small-file', file_unique_id: 'small-uid', width: 320, height: 240 },
					{ file_id: 'large-file', file_unique_id: 'large-uid', width: 1280, height: 960 },
				],
			},
			state: { user, business, isPlatformOwner: false, isActiveMember: true },
			reply: jest.fn().mockResolvedValue(undefined),
			...overrides,
		} as unknown as IdentifiedContext & { reply: jest.Mock }
	}

	it('enqueues one image job and acknowledges an active waiter photo', async () => {
		const { service, queueService, rateLimitService } = buildService()
		const ctx = buildContext()

		await service.handlePhoto(ctx)

		expect(rateLimitService.consume).toHaveBeenCalledWith('telegram:photo-rate:4242', 30, 60)
		expect(queueService.enqueueImageProcessingJob).toHaveBeenCalledWith({
			telegramUserId: '4242',
			telegramName: 'Abe Bekele',
			fileId: 'large-file',
			fileUniqueId: 'large-uid',
			businessId: 'business-1',
			userId: 'user-1',
		})
		expect(ctx.reply).toHaveBeenCalledWith('Received ✓')
	})

	it('rejects unknown users and does not enqueue', async () => {
		const { service, queueService } = buildService()
		const ctx = buildContext({
			state: { user: null, business: null, isPlatformOwner: false, isActiveMember: false },
		} as Partial<IdentifiedContext>)

		await service.handlePhoto(ctx)

		expect(queueService.enqueueImageProcessingJob).not.toHaveBeenCalled()
		expect(ctx.reply).toHaveBeenCalledWith("You're not registered. Send /register to create a Business, or ask your Manager for an Invite.")
	})

	it('rejects pending businesses and does not enqueue', async () => {
		const { service, queueService } = buildService()
		const ctx = buildContext({
			state: {
				user: { id: 'user-1', businessId: 'business-1' } as User,
				business: { id: 'business-1', status: 'pending' } as Business,
				isPlatformOwner: false,
				isActiveMember: true,
			},
		} as Partial<IdentifiedContext>)

		await service.handlePhoto(ctx)

		expect(queueService.enqueueImageProcessingJob).not.toHaveBeenCalled()
		expect(ctx.reply).toHaveBeenCalledWith("Your Business registration is pending approval. We'll notify you when you're ready to go.")
	})

	it('rejects suspended businesses and does not enqueue', async () => {
		const { service, queueService } = buildService()
		const ctx = buildContext({
			state: {
				user: { id: 'user-1', businessId: 'business-1' } as User,
				business: { id: 'business-1', status: 'suspended' } as Business,
				isPlatformOwner: false,
				isActiveMember: true,
			},
		} as Partial<IdentifiedContext>)

		await service.handlePhoto(ctx)

		expect(queueService.enqueueImageProcessingJob).not.toHaveBeenCalled()
		expect(ctx.reply).toHaveBeenCalledWith('Your Business is temporarily suspended. Please contact support.')
	})

	it('does not enqueue rate-limited photos', async () => {
		const { service, queueService, rateLimitService } = buildService()
		rateLimitService.consume.mockResolvedValue({ allowed: false, count: 31 })
		const ctx = buildContext()

		await service.handlePhoto(ctx)

		expect(queueService.enqueueImageProcessingJob).not.toHaveBeenCalled()
		expect(ctx.reply).toHaveBeenCalledWith("You're sending Receipts too quickly. Please wait a minute and try again.")
	})

	it('enqueues each media group photo and sends one grouped acknowledgement', async () => {
		jest.useFakeTimers()
		const { service, queueService } = buildService()
		const first = buildContext({ message: { photo: [{ file_id: 'file-1', file_unique_id: 'uid-1', width: 100, height: 100 }], media_group_id: 'group-1' } } as never)
		const second = buildContext({ message: { photo: [{ file_id: 'file-2', file_unique_id: 'uid-2', width: 100, height: 100 }], media_group_id: 'group-1' } } as never)

		await service.handlePhoto(first)
		await service.handlePhoto(second)
		jest.advanceTimersByTime(500)
		await Promise.resolve()

		expect(queueService.enqueueImageProcessingJob).toHaveBeenCalledTimes(2)
		expect(first.reply).toHaveBeenCalledWith('Received 2 Receipts ✓')
		expect(second.reply).not.toHaveBeenCalled()
		jest.useRealTimers()
	})
})
