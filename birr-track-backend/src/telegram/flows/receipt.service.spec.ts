import { ConfigService } from '@nestjs/config'

import { Business } from '../../businesses/entities/business.entity'
import { QueueService } from '../../queue/queue.service'
import { RateLimitService } from '../../shared/rate-limit/rate-limit.service'
import { User } from '../../users/entities/user.entity'
import { UsersService } from '../../users/users.service'
import { IdentifiedContext } from '../services/identity.service'
import { TelegramLinksService } from '../services/telegram-links.service'
import { botText } from '../telegram.i18n'
import { renderBotHtml } from '../telegram-html'
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
		const usersService = {
			findAnyByTelegramId: jest.fn().mockResolvedValue(null),
		} as unknown as jest.Mocked<Pick<UsersService, 'findAnyByTelegramId'>>
		const telegramLinks = {
			getMiniAppUrl: jest.fn().mockReturnValue('https://mini-app.example.com'),
			getSupportUrl: jest.fn().mockReturnValue('https://t.me/birr_track_support'),
		} as unknown as jest.Mocked<Pick<TelegramLinksService, 'getMiniAppUrl' | 'getSupportUrl'>>

		return {
			configService,
			queueService,
			rateLimitService,
			usersService,
			telegramLinks,
			service: new ReceiptService(
				configService as unknown as ConfigService,
				queueService as unknown as QueueService,
				rateLimitService as unknown as RateLimitService,
				usersService as unknown as UsersService,
				telegramLinks as unknown as TelegramLinksService,
			),
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
		expect(ctx.reply).toHaveBeenCalledWith('✅ Receipt received', { parse_mode: 'HTML' })
	})

	it('rejects unknown users and does not enqueue', async () => {
		const { service, queueService } = buildService()
		const ctx = buildContext({
			state: { user: null, business: null, isPlatformOwner: false, isActiveMember: false },
		} as Partial<IdentifiedContext>)

		await service.handlePhoto(ctx)

		expect(queueService.enqueueImageProcessingJob).not.toHaveBeenCalled()
		expect(ctx.reply).toHaveBeenCalledWith(
			renderBotHtml(botText('en').unknownPhotoUser, {}),
			expect.objectContaining({
				parse_mode: 'HTML',
				reply_markup: { inline_keyboard: [[expect.objectContaining({ text: 'Register a Business' })]] },
			}),
		)
	})

	it('rejects pending businesses and does not enqueue', async () => {
		const { service, queueService } = buildService()
		const ctx = buildContext({
			state: {
				user: { id: 'user-1', businessId: 'business-1' } as User,
				business: { id: 'business-1', name: 'Cafe Addis', status: 'pending' } as Business,
				isPlatformOwner: false,
				isActiveMember: true,
			},
		} as Partial<IdentifiedContext>)

		await service.handlePhoto(ctx)

		expect(queueService.enqueueImageProcessingJob).not.toHaveBeenCalled()
		expect(ctx.reply).toHaveBeenCalledWith(
			renderBotHtml(botText('en').pendingBusiness, { businessName: 'Cafe Addis' }),
			expect.objectContaining({
				parse_mode: 'HTML',
				reply_markup: { inline_keyboard: [[expect.objectContaining({ text: 'View Registration' })]] },
			}),
		)
	})

	it('rejects suspended businesses and does not enqueue', async () => {
		const { service, queueService } = buildService()
		const ctx = buildContext({
			state: {
				user: { id: 'user-1', businessId: 'business-1' } as User,
				business: { id: 'business-1', name: 'Cafe Addis', status: 'suspended' } as Business,
				isPlatformOwner: false,
				isActiveMember: true,
			},
		} as Partial<IdentifiedContext>)

		await service.handlePhoto(ctx)

		expect(queueService.enqueueImageProcessingJob).not.toHaveBeenCalled()
		expect(ctx.reply).toHaveBeenCalledWith(
			renderBotHtml(botText('en').suspendedBusiness, { businessName: 'Cafe Addis' }),
			expect.objectContaining({
				parse_mode: 'HTML',
				reply_markup: { inline_keyboard: [[expect.objectContaining({ text: 'Contact Support', url: 'https://t.me/birr_track_support' })]] },
			}),
		)
	})

	it('routes a rejected Business to Registration revision with its stored reason', async () => {
		const { service, queueService } = buildService()
		const ctx = buildContext({
			state: {
				user: { id: 'user-1', businessId: 'business-1', language: 'en' } as User,
				business: {
					id: 'business-1',
					name: 'Cafe <Addis> & Co',
					status: 'rejected',
					rejectionReason: 'Use the registered name.',
				} as Business,
				isPlatformOwner: false,
				isActiveMember: true,
			},
		} as Partial<IdentifiedContext>)

		await service.handlePhoto(ctx)

		expect(queueService.enqueueImageProcessingJob).not.toHaveBeenCalled()
		expect(ctx.reply).toHaveBeenCalledWith(
			expect.stringContaining('Cafe &lt;Addis&gt; &amp; Co'),
			expect.objectContaining({
				parse_mode: 'HTML',
				reply_markup: { inline_keyboard: [[expect.objectContaining({ text: 'Revise Registration' })]] },
			}),
		)
	})

	it('does not enqueue rate-limited photos', async () => {
		const { service, queueService, rateLimitService } = buildService()
		rateLimitService.consume.mockResolvedValue({ allowed: false, count: 31 })
		const ctx = buildContext()

		await service.handlePhoto(ctx)

		expect(queueService.enqueueImageProcessingJob).not.toHaveBeenCalled()
		expect(ctx.reply).toHaveBeenCalledWith(renderBotHtml(botText('en').throttled, {}), { parse_mode: 'HTML' })
	})

	it('enqueues each media group photo and sends one grouped acknowledgement', async () => {
		jest.useFakeTimers()
		const { service, queueService } = buildService()
		const first = buildContext({
			message: { photo: [{ file_id: 'file-1', file_unique_id: 'uid-1', width: 100, height: 100 }], media_group_id: 'group-1' },
		} as never)
		const second = buildContext({
			message: { photo: [{ file_id: 'file-2', file_unique_id: 'uid-2', width: 100, height: 100 }], media_group_id: 'group-1' },
		} as never)

		await service.handlePhoto(first)
		await service.handlePhoto(second)
		jest.advanceTimersByTime(500)
		await Promise.resolve()

		expect(queueService.enqueueImageProcessingJob).toHaveBeenCalledTimes(2)
		expect(first.reply).toHaveBeenCalledWith('✅ 2 Receipts received', { parse_mode: 'HTML' })
		expect(second.reply).not.toHaveBeenCalled()
		jest.useRealTimers()
	})

	it('keeps the dormant Needs Review notification localized to the Waiter', async () => {
		const { service, usersService } = buildService()
		usersService.findAnyByTelegramId.mockResolvedValue({ language: 'am' } as User)
		const sendMessage = jest.fn().mockResolvedValue(undefined)

		await service.pingWaiterForReview({ telegram: { sendMessage } }, '4242')

		expect(sendMessage).toHaveBeenCalledWith(
			'4242',
			botText('am').reviewPing,
			expect.objectContaining({
				parse_mode: 'HTML',
				reply_markup: { inline_keyboard: [[expect.objectContaining({ text: 'ትራንዛክሽኖችን ይገምግሙ' })]] },
			}),
		)
	})
})
