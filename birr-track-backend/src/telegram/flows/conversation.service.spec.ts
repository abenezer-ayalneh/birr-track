/* eslint-disable @typescript-eslint/unbound-method */
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { getBotToken } from 'nestjs-telegraf'

import { BusinessesService } from '../../businesses/businesses.service'
import { InvitesService } from '../../invites/invites.service'
import { UsersService } from '../../users/users.service'
import { IdentifiedContext } from '../services/identity.service'
import { REGISTER_OR_INVITE_MESSAGE, TELEGRAM_BOT_NAME, WELCOME_MESSAGE_PLATFORM_OWNER } from '../telegram.constants'
import { ConversationService } from './conversation.service'

describe('ConversationService', () => {
	let service: ConversationService
	let invitesService: InvitesService

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				ConversationService,
				{
					provide: getBotToken(TELEGRAM_BOT_NAME),
					useValue: { telegram: { setChatMenuButton: jest.fn() } },
				},
				{
					provide: UsersService,
					useValue: {
						isPlatformOwner: jest.fn(),
						findByTelegramId: jest.fn(),
						joinBusiness: jest.fn(),
						findById: jest.fn(),
						hasRoleAtLeast: jest.fn(),
					},
				},
				{
					provide: BusinessesService,
					useValue: {
						create: jest.fn(),
						findById: jest.fn(),
						save: jest.fn(),
					},
				},
				{
					provide: InvitesService,
					useValue: {
						create: jest.fn(),
						redeem: jest.fn(),
					},
				},
				{
					provide: ConfigService,
					useValue: {
						get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue),
					},
				},
			],
		}).compile()

		service = module.get<ConversationService>(ConversationService)
		invitesService = module.get(InvitesService)
	})

	/** Builds a minimal /start context and returns the reply spy so assertions reference a local mock. */
	function buildStart(state: Partial<IdentifiedContext['state']> = {}) {
		const reply = jest.fn().mockResolvedValue(undefined)
		const ctx = {
			from: { id: 4242, first_name: 'Plat', last_name: 'Owner', username: 'platowner' },
			state: { user: null, business: null, isPlatformOwner: false, isActiveMember: false, ...state },
			session: {},
			reply,
		} as unknown as IdentifiedContext
		return { ctx, reply }
	}

	it('should be defined', () => {
		expect(service).toBeDefined()
	})

	describe('handleStart', () => {
		it('greets the Platform Owner with the admin panel instead of the register flow', async () => {
			const { ctx, reply } = buildStart({ isPlatformOwner: true })

			await service.handleStart(ctx)

			// Platform Owner is env-bootstrapped (no users row) — must not be pushed into invite redemption or registration.
			expect(invitesService.redeem).not.toHaveBeenCalled()
			expect(reply).toHaveBeenCalledTimes(1)
			expect(reply).toHaveBeenCalledWith(WELCOME_MESSAGE_PLATFORM_OWNER, expect.anything())
		})

		it('shows the register-or-invite flow to an unknown, non-owner user', async () => {
			// Default redeem mock resolves undefined (no pending invite) → falls through to the register prompt.
			const { ctx, reply } = buildStart()

			await service.handleStart(ctx)

			expect(reply).toHaveBeenCalledWith(REGISTER_OR_INVITE_MESSAGE, expect.anything())
		})
	})

	describe('handleUserShared', () => {
		it('passes non-user_shared messages through so photos can reach ReceiptService', async () => {
			const next = jest.fn().mockResolvedValue(undefined)
			const ctx = {
				message: { photo: [{ file_id: 'receipt-file', file_unique_id: 'receipt-uid', width: 1280, height: 960 }] },
				state: { user: null, business: null, isPlatformOwner: false, isActiveMember: false },
			} as unknown as IdentifiedContext

			await service.handleUserShared(ctx, next)

			expect(next).toHaveBeenCalledTimes(1)
		})
	})
})
