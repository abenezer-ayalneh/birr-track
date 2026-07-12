/* eslint-disable @typescript-eslint/unbound-method */
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { getBotToken } from 'nestjs-telegraf'

import { BusinessesService } from '../../businesses/businesses.service'
import { InvitesService } from '../../invites/invites.service'
import { UsersService } from '../../users/users.service'
import { IdentifiedContext } from '../services/identity.service'
import {
	BOT_SHORT_DESCRIPTION,
	TELEGRAM_BOT_NAME,
} from '../telegram.constants'
import { ConversationService } from './conversation.service'

describe('ConversationService', () => {
	let service: ConversationService
	let invitesService: InvitesService
	let bot: {
		telegram: {
			setChatMenuButton: jest.Mock
			setMyCommands: jest.Mock
			setMyDescription: jest.Mock
			setMyShortDescription: jest.Mock
		}
	}

	beforeEach(async () => {
		bot = {
			telegram: {
				setChatMenuButton: jest.fn().mockResolvedValue(undefined),
				setMyCommands: jest.fn().mockResolvedValue(undefined),
				setMyDescription: jest.fn().mockResolvedValue(undefined),
				setMyShortDescription: jest.fn().mockResolvedValue(undefined),
			},
		}

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				ConversationService,
				{
					provide: getBotToken(TELEGRAM_BOT_NAME),
					useValue: bot,
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
			chat: { id: 777 },
			state: { user: null, business: null, isPlatformOwner: false, isActiveMember: false, ...state },
			session: {},
			reply,
		} as unknown as IdentifiedContext
		return { ctx, reply }
	}

	function buildHelp(state: Partial<IdentifiedContext['state']> = {}) {
		const reply = jest.fn().mockResolvedValue(undefined)
		const ctx = {
			from: { id: 4242, first_name: 'Abe', last_name: 'Bekele', username: 'abe' },
			chat: { id: 777 },
			state: { user: null, business: null, isPlatformOwner: false, isActiveMember: false, ...state },
			session: {},
			reply,
		} as unknown as IdentifiedContext
		return { ctx, reply }
	}

	it('should be defined', () => {
		expect(service).toBeDefined()
	})

	describe('onModuleInit', () => {
		it('configures bot profile descriptions and the default command list', async () => {
			await service.onModuleInit()

			expect(bot.telegram.setMyShortDescription).toHaveBeenCalledWith(BOT_SHORT_DESCRIPTION, undefined)
			expect(bot.telegram.setMyShortDescription).toHaveBeenCalledWith(expect.stringContaining('ደረሰኞች'), 'am')
			expect(bot.telegram.setMyDescription).toHaveBeenCalledWith(expect.stringContaining('Birr Track helps'), undefined)
			expect(bot.telegram.setMyDescription).toHaveBeenCalledWith(expect.stringContaining('ይረዳል'), 'am')
			expect(bot.telegram.setMyCommands).toHaveBeenCalledWith([
				{ command: 'start', description: 'Start or refresh your session' },
				{ command: 'help', description: 'Show what this bot can do' },
				{ command: 'register', description: 'Register a Business' },
				{ command: 'lang', description: 'Choose language' },
			])
		})
	})

	describe('handleStart', () => {
		it('greets the Platform Owner with the admin panel instead of the register flow', async () => {
			const { ctx, reply } = buildStart({ isPlatformOwner: true })

			await service.handleStart(ctx)

			// Platform Owner has no users row, so first start asks for language before normal flow.
			expect(invitesService.redeem).not.toHaveBeenCalled()
			expect(reply).toHaveBeenCalledTimes(1)
			expect(reply).toHaveBeenCalledWith('Choose your language.', expect.anything())
		})

		it('refreshes chat commands for a Manager', async () => {
			const { ctx } = buildStart({
				user: { id: 'user-1', role: 'manager', businessId: 'business-1', language: 'en' } as never,
				business: { id: 'business-1', name: 'Cafe Addis' } as never,
				isActiveMember: true,
			})

			await service.handleStart(ctx)

			expect(bot.telegram.setMyCommands).toHaveBeenCalledWith(
				[
					{ command: 'start', description: 'Refresh your menu' },
					{ command: 'help', description: 'Show help' },
					{ command: 'lang', description: 'Choose language' },
					{ command: 'invite', description: 'Invite a Waiter' },
				],
				{ scope: { type: 'chat', chat_id: 777 }, language_code: undefined },
			)
		})

		it('shows the register-or-invite flow to an unknown, non-owner user', async () => {
			// Default redeem mock resolves undefined (no pending invite) → falls through to the register prompt.
			const { ctx, reply } = buildStart()

			await service.handleStart(ctx)

			expect(reply).toHaveBeenCalledWith('Choose your language.', expect.anything())
		})
	})

	describe('handleHelpCommand', () => {
		it('explains registration to unknown users', async () => {
			const { ctx, reply } = buildHelp()

			await service.handleHelpCommand(ctx)

			expect(reply).toHaveBeenCalledWith(expect.stringContaining('/lang - Choose language.'))
			expect(bot.telegram.setMyCommands).toHaveBeenCalledWith(
				[
					{ command: 'start', description: 'Start or refresh your session' },
					{ command: 'help', description: 'Show what this bot can do' },
					{ command: 'register', description: 'Register a Business' },
					{ command: 'lang', description: 'Choose language' },
				],
				{ scope: { type: 'chat', chat_id: 777 }, language_code: undefined },
			)
		})

		it('explains Receipt submission to Waiters', async () => {
			const { ctx, reply } = buildHelp({
				user: { id: 'user-1', role: 'waiter', businessId: 'business-1', language: 'en' } as never,
				business: { id: 'business-1', name: 'Cafe Addis' } as never,
				isActiveMember: true,
			})

			await service.handleHelpCommand(ctx)

			expect(reply).toHaveBeenCalledWith(expect.stringContaining('/lang - Choose language.'))
			expect(bot.telegram.setMyCommands).toHaveBeenCalledWith(
				[
					{ command: 'start', description: 'Refresh your menu' },
					{ command: 'help', description: 'Show help' },
					{ command: 'lang', description: 'Choose language' },
				],
				{ scope: { type: 'chat', chat_id: 777 }, language_code: undefined },
			)
		})

		it('explains invite access to Managers', async () => {
			const { ctx, reply } = buildHelp({
				user: { id: 'user-1', role: 'manager', businessId: 'business-1', language: 'en' } as never,
				business: { id: 'business-1', name: 'Cafe Addis' } as never,
				isActiveMember: true,
			})

			await service.handleHelpCommand(ctx)

			expect(reply).toHaveBeenCalledWith(expect.stringContaining('/invite - Invite a Waiter.'))
		})

		it('explains Manager invites to Owners', async () => {
			const { ctx, reply } = buildHelp({
				user: { id: 'user-1', role: 'owner', businessId: 'business-1', language: 'en' } as never,
				business: { id: 'business-1', name: 'Cafe Addis' } as never,
				isActiveMember: true,
			})

			await service.handleHelpCommand(ctx)

			expect(reply).toHaveBeenCalledWith(expect.stringContaining('/invite - Invite a Waiter or Manager.'))
			expect(bot.telegram.setMyCommands).toHaveBeenCalledWith(
				[
					{ command: 'start', description: 'Refresh your menu' },
					{ command: 'help', description: 'Show help' },
					{ command: 'lang', description: 'Choose language' },
					{ command: 'invite', description: 'Invite a Waiter or Manager' },
				],
				{ scope: { type: 'chat', chat_id: 777 }, language_code: undefined },
			)
		})

		it('explains Admin Panel access to the Platform Owner', async () => {
			const { ctx, reply } = buildHelp({ isPlatformOwner: true })

			await service.handleHelpCommand(ctx)

			expect(reply).toHaveBeenCalledWith(expect.stringContaining('/lang - Choose language.'))
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
