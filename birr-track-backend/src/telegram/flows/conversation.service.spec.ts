/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing'
import { getBotToken } from 'nestjs-telegraf'

import { InvitesService } from '../../invites/invites.service'
import { UsersService } from '../../users/users.service'
import { IdentifiedContext } from '../services/identity.service'
import { TelegramLinksService } from '../services/telegram-links.service'
import { TELEGRAM_BOT_NAME } from '../telegram.constants'
import { botText } from '../telegram.i18n'
import { renderBotHtml } from '../telegram-html'
import { ConversationService } from './conversation.service'

describe('ConversationService', () => {
	let service: ConversationService
	let invitesService: InvitesService
	let usersService: { hasRoleAtLeast: jest.Mock }
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
						updateLanguage: jest.fn(),
						findById: jest.fn(),
						hasRoleAtLeast: jest.fn((user: { role?: string }) => user.role === 'manager' || user.role === 'owner'),
					},
				},
				{
					provide: InvitesService,
					useValue: {
						create: jest.fn(),
						createBatch: jest.fn(),
						redeem: jest.fn(),
					},
				},
				{
					provide: TelegramLinksService,
					useValue: {
						getMiniAppUrl: jest.fn().mockReturnValue('https://mini-app.example.com'),
						getSupportUrl: jest.fn().mockReturnValue('https://t.me/birr_track_support'),
					},
				},
			],
		}).compile()

		service = module.get<ConversationService>(ConversationService)
		invitesService = module.get(InvitesService)
		usersService = module.get(UsersService)
	})

	/** Builds a minimal /start context and returns the reply spy so assertions reference a local mock. */
	function buildStart(state: Partial<IdentifiedContext['state']> = {}, payload?: string) {
		const reply = jest.fn().mockResolvedValue(undefined)
		const ctx = {
			from: { id: 4242, first_name: 'Plat', last_name: 'Owner', username: 'platowner' },
			chat: { id: 777 },
			payload,
			state: { user: null, business: null, isPlatformOwner: false, isActiveMember: false, ...state },
			session: {},
			telegram: { sendMessage: jest.fn().mockResolvedValue(undefined) },
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

	function getInlineKeyboard(reply: jest.Mock): unknown {
		const calls = reply.mock.calls as unknown[][]
		const options = calls[0]?.[1] as { reply_markup?: { inline_keyboard?: unknown } } | undefined
		return options?.reply_markup?.inline_keyboard
	}

	function getReplyKeyboard(reply: jest.Mock): unknown {
		const calls = reply.mock.calls as unknown[][]
		const options = calls[0]?.[1] as { reply_markup?: { keyboard?: unknown } } | undefined
		return options?.reply_markup?.keyboard
	}

	it('should be defined', () => {
		expect(service).toBeDefined()
	})

	describe('onModuleInit', () => {
		it('configures bot profile descriptions and the default command list', async () => {
			await service.onModuleInit()

			expect(bot.telegram.setMyShortDescription).toHaveBeenCalledWith(botText('en').shortDescription, undefined)
			expect(bot.telegram.setMyShortDescription).toHaveBeenCalledWith(expect.stringContaining('ደረሰኞች'), 'am')
			expect(bot.telegram.setMyDescription).toHaveBeenCalledWith(botText('en').description, undefined)
			expect(bot.telegram.setMyDescription).toHaveBeenCalledWith(expect.stringContaining('ይረዳል'), 'am')
			expect(bot.telegram.setMyCommands).toHaveBeenCalledWith(botText('en').commands.unknown)
			expect(bot.telegram.setChatMenuButton).toHaveBeenCalledWith({
				menuButton: { type: 'web_app', text: 'Open Mini App', web_app: { url: 'https://mini-app.example.com' } },
			})
		})
	})

	describe('handleStart', () => {
		it('greets the Platform Owner with the Mini App instead of the register flow', async () => {
			const { ctx, reply } = buildStart({ isPlatformOwner: true })

			await service.handleStart(ctx)

			// Platform Owner has no users row, so first start asks for language before normal flow.
			expect(invitesService.redeem).not.toHaveBeenCalled()
			expect(reply).toHaveBeenCalledTimes(1)
			expect(reply).toHaveBeenCalledWith(renderBotHtml(botText('en').languagePrompt, {}), expect.objectContaining({ parse_mode: 'HTML' }))
		})

		it('opens Platform Owner tools after language selection', async () => {
			const { ctx, reply } = buildStart({ isPlatformOwner: true })
			ctx.session = { language: 'en' }

			await service.handleStart(ctx)

			expect(reply).toHaveBeenCalledWith(botText('en').welcomePlatformOwner, expect.objectContaining({ parse_mode: 'HTML' }))
			expect(getInlineKeyboard(reply)).toEqual([[expect.objectContaining({ text: 'Open Mini App' })]])
			expect(invitesService.redeem).not.toHaveBeenCalled()
		})

		it('shows a pending Registration with View Registration', async () => {
			const { ctx, reply } = buildStart({
				user: { id: 'user-1', role: 'owner', businessId: 'business-1', language: 'en' } as never,
				business: { id: 'business-1', name: 'Cafe Addis', status: 'pending' } as never,
				isActiveMember: true,
			})

			await service.handleStart(ctx)

			expect(reply).toHaveBeenCalledWith(expect.stringContaining('Registration pending'), expect.objectContaining({ parse_mode: 'HTML' }))
			expect(getInlineKeyboard(reply)).toEqual([[expect.objectContaining({ text: 'View Registration' })]])
		})

		it('shows a rejected Registration reason with Revise Registration', async () => {
			const { ctx, reply } = buildStart({
				user: { id: 'user-1', role: 'owner', businessId: 'business-1', language: 'en' } as never,
				business: {
					id: 'business-1',
					name: 'Cafe <Addis> & Co',
					status: 'rejected',
					rejectionReason: 'Use the registered name.',
				} as never,
				isActiveMember: false,
			})

			await service.handleStart(ctx)

			expect(reply).toHaveBeenCalledWith(expect.stringContaining('Cafe &lt;Addis&gt; &amp; Co'), expect.objectContaining({ parse_mode: 'HTML' }))
			expect(reply).toHaveBeenCalledWith(expect.stringContaining('Use the registered name.'), expect.anything())
			expect(getInlineKeyboard(reply)).toEqual([[expect.objectContaining({ text: 'Revise Registration' })]])
		})

		it('shows only Contact Support for a suspended Business', async () => {
			const { ctx, reply } = buildStart({
				user: { id: 'user-1', role: 'owner', businessId: 'business-1', language: 'en' } as never,
				business: { id: 'business-1', name: 'Cafe Addis', status: 'suspended' } as never,
				isActiveMember: true,
			})

			await service.handleStart(ctx)

			expect(reply).toHaveBeenCalledWith(expect.stringContaining('Business suspended'), expect.objectContaining({ parse_mode: 'HTML' }))
			expect(getInlineKeyboard(reply)).toEqual([[expect.objectContaining({ text: 'Contact Support', url: 'https://t.me/birr_track_support' })]])
			expect(getReplyKeyboard(reply)).toBeUndefined()
		})

		it('refreshes chat commands for a Manager', async () => {
			const { ctx, reply } = buildStart({
				user: { id: 'user-1', role: 'manager', businessId: 'business-1', language: 'en' } as never,
				business: { id: 'business-1', name: 'Cafe Addis', status: 'active' } as never,
				isActiveMember: true,
			})

			await service.handleStart(ctx)

			expect(bot.telegram.setMyCommands).toHaveBeenCalledWith(botText('en').commands.manager, {
				scope: { type: 'chat', chat_id: 777 },
				language_code: undefined,
			})
			expect(reply).toHaveBeenCalledWith(
				renderBotHtml(botText('en').welcomeRegistered, { businessName: 'Cafe Addis', role: 'Manager' }),
				expect.objectContaining({ parse_mode: 'HTML' }),
			)
			expect(getReplyKeyboard(reply)).toEqual([
				[expect.objectContaining({ text: 'Submit Receipt' }), expect.objectContaining({ text: 'Open Mini App' })],
				[expect.objectContaining({ text: 'Invite Member' })],
			])
		})

		it('omits the Invite button from a Waiter main menu', async () => {
			const { ctx, reply } = buildStart({
				user: { id: 'user-1', role: 'waiter', businessId: 'business-1', language: 'en' } as never,
				business: { id: 'business-1', name: 'Cafe Addis', status: 'active' } as never,
				isActiveMember: true,
			})

			await service.handleStart(ctx)

			expect(getReplyKeyboard(reply)).toEqual([[expect.objectContaining({ text: 'Submit Receipt' }), expect.objectContaining({ text: 'Open Mini App' })]])
		})

		it('starts the Waiter Invite flow for a Manager deep link', async () => {
			const { ctx, reply } = buildStart(
				{
					user: { id: 'user-1', role: 'manager', businessId: 'business-1', language: 'en' } as never,
					business: { id: 'business-1', name: 'Cafe Addis', status: 'active' } as never,
					isActiveMember: true,
				},
				'invite',
			)

			await service.handleStart(ctx)

			expect(reply).toHaveBeenCalledWith(renderBotHtml(botText('en').chooseInviteRole, {}), expect.objectContaining({ parse_mode: 'HTML' }))
			const managerKeyboard = getInlineKeyboard(reply)
			expect(managerKeyboard).toEqual([[expect.objectContaining({ callback_data: 'invite_role_waiter' })]])
			expect(ctx.session).toMatchObject({ inviting: true })
		})

		it('starts the Waiter or Manager Invite flow for an Owner deep link', async () => {
			const { ctx, reply } = buildStart(
				{
					user: { id: 'user-1', role: 'owner', businessId: 'business-1', language: 'en' } as never,
					business: { id: 'business-1', name: 'Cafe Addis', status: 'active' } as never,
					isActiveMember: true,
				},
				'invite',
			)

			await service.handleStart(ctx)

			expect(reply).toHaveBeenCalledWith(renderBotHtml(botText('en').chooseInviteRole, {}), expect.objectContaining({ parse_mode: 'HTML' }))
			const ownerKeyboard = getInlineKeyboard(reply)
			expect(ownerKeyboard).toEqual([
				[expect.objectContaining({ callback_data: 'invite_role_waiter' })],
				[expect.objectContaining({ callback_data: 'invite_role_manager' })],
			])
		})

		it('rejects an Invite deep link from a Waiter', async () => {
			const { ctx, reply } = buildStart(
				{
					user: { id: 'user-1', role: 'waiter', businessId: 'business-1', language: 'en' } as never,
					business: { id: 'business-1', name: 'Cafe Addis', status: 'active' } as never,
					isActiveMember: true,
				},
				'invite',
			)

			await service.handleStart(ctx)

			expect(reply).toHaveBeenCalledWith(renderBotHtml(botText('en').onlyManagersInvite, {}), { parse_mode: 'HTML' })
			expect(ctx.session).not.toMatchObject({ inviting: true })
		})

		it('asks an unknown user to choose a language first', async () => {
			// Default redeem mock resolves undefined (no pending invite) → falls through to the register prompt.
			const { ctx, reply } = buildStart()

			await service.handleStart(ctx)

			expect(reply).toHaveBeenCalledWith(renderBotHtml(botText('en').languagePrompt, {}), expect.objectContaining({ parse_mode: 'HTML' }))
		})

		it('shows Register a Business without the obsolete ask-manager keyboard button', async () => {
			const { ctx, reply } = buildStart()
			ctx.session = { language: 'en' }

			await service.handleStart(ctx)

			expect(reply).toHaveBeenCalledWith(botText('en').registerOrInvite, expect.objectContaining({ parse_mode: 'HTML' }))
			expect(getInlineKeyboard(reply)).toEqual([[expect.objectContaining({ text: 'Register a Business' })]])
			expect(JSON.stringify(reply.mock.calls)).not.toContain('Ask your manager')
		})

		it('uses the business name in the invitation welcome message', async () => {
			const { ctx, reply } = buildStart({}, undefined)
			ctx.session = { language: 'en' }
			;(invitesService.redeem as jest.Mock).mockResolvedValue({
				invite: {
					business: { id: 'business-1', name: 'Cafe Addis', status: 'active' },
					createdBy: { id: 'user-1', telegramUserId: '111', language: 'am' },
				},
				user: { id: 'user-2', businessId: 'business-1', role: 'waiter', language: 'en' },
			})

			await service.handleStart(ctx)

			expect(reply).toHaveBeenCalledWith(
				renderBotHtml(botText('en').inviteRedeemed, { businessName: 'Cafe Addis', role: 'Waiter' }),
				expect.objectContaining({ parse_mode: 'HTML' }),
			)
			expect(reply).not.toHaveBeenCalledWith(expect.stringContaining('business-1'), expect.anything())
			expect(ctx.telegram.sendMessage).toHaveBeenCalledWith('111', expect.stringContaining('አስተናጋጅ'), { parse_mode: 'HTML' })
		})
	})

	describe('handleRegisterCommand', () => {
		it('routes an unknown user to the Mini App registration flow', async () => {
			const { ctx, reply } = buildStart()

			await service.handleRegisterCommand(ctx)

			expect(reply).toHaveBeenCalledWith(renderBotHtml(botText('en').registerOrInvite, {}), expect.objectContaining({ parse_mode: 'HTML' }))
			expect(getInlineKeyboard(reply)).toEqual([[expect.objectContaining({ text: 'Register a Business' })]])
		})

		it('routes a rejected Prospective Owner to Registration revision instead of the active menu', async () => {
			const { ctx, reply } = buildStart({
				user: { id: 'user-1', role: 'owner', businessId: 'business-1', language: 'en' } as never,
				business: { id: 'business-1', name: 'Cafe Addis', status: 'rejected' } as never,
				isActiveMember: false,
			})

			await service.handleRegisterCommand(ctx)

			expect(reply).toHaveBeenCalledWith(expect.stringContaining('Registration needs revision'), expect.objectContaining({ parse_mode: 'HTML' }))
			expect(getInlineKeyboard(reply)).toEqual([[expect.objectContaining({ text: 'Revise Registration' })]])
			expect(reply).not.toHaveBeenCalledWith(expect.stringContaining('already registered'), expect.anything())
		})
	})

	describe('handleRegistrationText', () => {
		it('continues recognizing the stale Receipt keyboard label', async () => {
			const { ctx, reply } = buildStart({
				user: { id: 'user-1', role: 'waiter', businessId: 'business-1', language: 'en' } as never,
				business: { id: 'business-1', name: 'Cafe Addis', status: 'active' } as never,
				isActiveMember: true,
			})
			;(ctx as unknown as { message: { text: string } }).message = { text: '📸 Submit Receipt' }

			await service.handleRegistrationText(ctx)

			expect(reply).toHaveBeenCalledWith(botText('en').submitReceiptPrompt, { parse_mode: 'HTML' })
		})

		it('routes a stale Receipt keyboard label to support after Business suspension', async () => {
			const { ctx, reply } = buildStart({
				user: { id: 'user-1', role: 'waiter', businessId: 'business-1', language: 'en' } as never,
				business: { id: 'business-1', name: 'Cafe Addis', status: 'suspended' } as never,
				isActiveMember: true,
			})
			;(ctx as unknown as { message: { text: string } }).message = { text: '📸 Submit Receipt' }

			await service.handleRegistrationText(ctx)

			expect(reply).toHaveBeenCalledWith(expect.stringContaining('Business suspended'), expect.objectContaining({ parse_mode: 'HTML' }))
			expect(getInlineKeyboard(reply)).toEqual([[expect.objectContaining({ text: 'Contact Support' })]])
			expect(reply).not.toHaveBeenCalledWith(botText('en').submitReceiptPrompt, expect.anything())
		})
	})

	describe('handleInviteCommand', () => {
		it('uses the same role chooser as the deep-link flow', async () => {
			const { ctx, reply } = buildStart({
				user: { id: 'user-1', role: 'owner', businessId: 'business-1', language: 'en' } as never,
				business: { id: 'business-1', name: 'Cafe Addis', status: 'active' } as never,
				isActiveMember: true,
			})

			await service.handleInviteCommand(ctx)

			expect(usersService.hasRoleAtLeast).toHaveBeenCalledWith(ctx.state.user, 'manager')
			expect(reply).toHaveBeenCalledWith(renderBotHtml(botText('en').chooseInviteRole, {}), expect.objectContaining({ parse_mode: 'HTML' }))
		})
	})

	describe('handleCallbackQuery', () => {
		it('edits the language chooser and continues without a duplicate saved-message reply', async () => {
			const reply = jest.fn().mockResolvedValue(undefined)
			const editMessageText = jest.fn().mockResolvedValue(undefined)
			const answerCbQuery = jest.fn().mockResolvedValue(undefined)
			const ctx = {
				from: { id: 4242, first_name: 'Abe' },
				chat: { id: 777 },
				callbackQuery: { data: 'language_en' },
				state: { user: null, business: null, isPlatformOwner: false, isActiveMember: false },
				session: {},
				telegram: { sendMessage: jest.fn().mockResolvedValue(undefined) },
				reply,
				editMessageText,
				answerCbQuery,
			} as unknown as IdentifiedContext

			await service.handleCallbackQuery(ctx)

			expect(answerCbQuery).toHaveBeenCalledWith('Language updated.')
			expect(editMessageText).toHaveBeenCalledWith(
				renderBotHtml(botText('en').selectionConfirmed, { selection: 'English' }),
				expect.objectContaining({ parse_mode: 'HTML', reply_markup: undefined }),
			)
			expect(reply).toHaveBeenCalledTimes(1)
			expect(reply).toHaveBeenCalledWith(botText('en').registerOrInvite, expect.objectContaining({ parse_mode: 'HTML' }))
			expect(reply).not.toHaveBeenCalledWith('Language updated.')
		})
	})

	describe('handleInviteRoleCallbackQuery', () => {
		it('rejects a forged Manager-role selection from a Manager', async () => {
			const reply = jest.fn().mockResolvedValue(undefined)
			const answerCbQuery = jest.fn().mockResolvedValue(undefined)
			const editMessageText = jest.fn().mockResolvedValue(undefined)
			const ctx = {
				callbackQuery: { data: 'invite_role_manager' },
				state: {
					user: { id: 'user-1', role: 'manager', businessId: 'business-1', language: 'en' },
					business: { id: 'business-1', name: 'Cafe Addis', status: 'active' },
					isPlatformOwner: false,
					isActiveMember: true,
				},
				session: { inviting: true },
				reply,
				answerCbQuery,
				editMessageText,
			} as unknown as IdentifiedContext

			await service.handleInviteRoleCallbackQuery(ctx)

			expect(invitesService.createBatch).not.toHaveBeenCalled()
			expect(answerCbQuery).toHaveBeenCalledWith('Owner required.')
			expect(editMessageText).toHaveBeenCalledWith(
				renderBotHtml(botText('en').onlyOwnerInviteManager, {}),
				expect.objectContaining({ parse_mode: 'HTML', reply_markup: undefined }),
			)
			expect(reply).not.toHaveBeenCalled()
			expect(ctx.session).toMatchObject({ inviting: false, inviteRole: undefined })
		})

		it('allows an Owner to select a Manager role', async () => {
			const reply = jest.fn().mockResolvedValue(undefined)
			const answerCbQuery = jest.fn().mockResolvedValue(undefined)
			const editMessageText = jest.fn().mockResolvedValue(undefined)
			const ctx = {
				callbackQuery: { data: 'invite_role_manager' },
				state: {
					user: { id: 'user-1', role: 'owner', businessId: 'business-1', language: 'en' },
					business: { id: 'business-1', name: 'Cafe Addis', status: 'active' },
					isPlatformOwner: false,
					isActiveMember: true,
				},
				session: { inviting: true },
				reply,
				answerCbQuery,
				editMessageText,
			} as unknown as IdentifiedContext

			await service.handleInviteRoleCallbackQuery(ctx)

			expect(ctx.session).toMatchObject({ inviting: true, inviteRole: 'manager' })
			expect(answerCbQuery).toHaveBeenCalledWith('Manager')
			expect(editMessageText).toHaveBeenCalledWith(
				renderBotHtml(botText('en').selectionConfirmed, { selection: 'Manager' }),
				expect.objectContaining({ parse_mode: 'HTML', reply_markup: undefined }),
			)
			expect(reply).toHaveBeenCalledWith(expect.stringContaining('<b>Role:</b> Manager'), expect.objectContaining({ parse_mode: 'HTML' }))
			const keyboard = getReplyKeyboard(reply) as { request_users?: { max_quantity?: number; request_name?: boolean } }[][]
			expect(keyboard[0]?.[0]?.request_users).toMatchObject({ max_quantity: 10, request_name: true })
		})

		it('edits the role chooser with the localized selected role', async () => {
			const reply = jest.fn().mockResolvedValue(undefined)
			const editMessageText = jest.fn().mockResolvedValue(undefined)
			const answerCbQuery = jest.fn().mockResolvedValue(undefined)
			const ctx = {
				callbackQuery: { data: 'invite_role_waiter' },
				state: {
					user: { id: 'user-1', role: 'manager', businessId: 'business-1', language: 'am' },
					business: { id: 'business-1', name: 'Cafe Addis', status: 'active' },
					isPlatformOwner: false,
					isActiveMember: true,
				},
				session: { inviting: true },
				reply,
				editMessageText,
				answerCbQuery,
			} as unknown as IdentifiedContext

			await service.handleInviteRoleCallbackQuery(ctx)

			expect(answerCbQuery).toHaveBeenCalledWith(botText('am').waiter)
			expect(editMessageText).toHaveBeenCalledWith(botText('am').waiter, expect.objectContaining({ parse_mode: 'HTML', reply_markup: undefined }))
			expect(reply).toHaveBeenCalledWith(expect.stringContaining(botText('am').waiter), expect.objectContaining({ parse_mode: 'HTML' }))
		})
	})

	describe('handleHelpCommand', () => {
		it('explains registration to unknown users', async () => {
			const { ctx, reply } = buildHelp()

			await service.handleHelpCommand(ctx)

			expect(reply).toHaveBeenCalledWith(botText('en').help.unknown, { parse_mode: 'HTML' })
			expect(bot.telegram.setMyCommands).toHaveBeenCalledWith(botText('en').commands.unknown, {
				scope: { type: 'chat', chat_id: 777 },
				language_code: undefined,
			})
		})

		it('explains Receipt submission to Waiters', async () => {
			const { ctx, reply } = buildHelp({
				user: { id: 'user-1', role: 'waiter', businessId: 'business-1', language: 'en' } as never,
				business: { id: 'business-1', name: 'Cafe Addis', status: 'active' } as never,
				isActiveMember: true,
			})

			await service.handleHelpCommand(ctx)

			expect(reply).toHaveBeenCalledWith(botText('en').help.waiter, { parse_mode: 'HTML' })
			expect(bot.telegram.setMyCommands).toHaveBeenCalledWith(botText('en').commands.waiter, {
				scope: { type: 'chat', chat_id: 777 },
				language_code: undefined,
			})
		})

		it('explains invite access to Managers', async () => {
			const { ctx, reply } = buildHelp({
				user: { id: 'user-1', role: 'manager', businessId: 'business-1', language: 'en' } as never,
				business: { id: 'business-1', name: 'Cafe Addis', status: 'active' } as never,
				isActiveMember: true,
			})

			await service.handleHelpCommand(ctx)

			expect(reply).toHaveBeenCalledWith(botText('en').help.manager, { parse_mode: 'HTML' })
		})

		it('explains Manager invites to Owners', async () => {
			const { ctx, reply } = buildHelp({
				user: { id: 'user-1', role: 'owner', businessId: 'business-1', language: 'en' } as never,
				business: { id: 'business-1', name: 'Cafe Addis', status: 'active' } as never,
				isActiveMember: true,
			})

			await service.handleHelpCommand(ctx)

			expect(reply).toHaveBeenCalledWith(botText('en').help.owner, { parse_mode: 'HTML' })
			expect(bot.telegram.setMyCommands).toHaveBeenCalledWith(botText('en').commands.owner, {
				scope: { type: 'chat', chat_id: 777 },
				language_code: undefined,
			})
		})

		it('explains Mini App access to the Platform Owner', async () => {
			const { ctx, reply } = buildHelp({ isPlatformOwner: true })

			await service.handleHelpCommand(ctx)

			expect(reply).toHaveBeenCalledWith(botText('en').help.platform_owner, { parse_mode: 'HTML' })
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

		it('does not create an Invite from a shared user outside an active invite flow', async () => {
			const next = jest.fn().mockResolvedValue(undefined)
			const ctx = {
				message: { user_shared: { user_id: 9876 } },
				state: { user: null, business: null, isPlatformOwner: false, isActiveMember: false },
				session: {},
			} as unknown as IdentifiedContext

			await service.handleUserShared(ctx, next)

			expect(invitesService.createBatch).not.toHaveBeenCalled()
			expect(next).toHaveBeenCalledTimes(1)
		})

		it('rechecks the role before creating an Invite', async () => {
			const reply = jest.fn().mockResolvedValue(undefined)
			const createInviteBatch = invitesService.createBatch as jest.Mock
			createInviteBatch.mockResolvedValue([])
			const ctx = {
				message: { user_shared: { user_id: 9876 } },
				state: {
					user: { id: 'user-1', role: 'manager', businessId: 'business-1', language: 'en' },
					business: { id: 'business-1', name: 'Cafe Addis', status: 'active' },
					isPlatformOwner: false,
					isActiveMember: true,
				},
				session: { inviting: true, inviteRole: 'manager' },
				reply,
			} as unknown as IdentifiedContext

			await service.handleUserShared(ctx)

			expect(createInviteBatch).not.toHaveBeenCalled()
			expect(reply).toHaveBeenCalledWith(renderBotHtml(botText('en').onlyOwnerInviteManager, {}), expect.objectContaining({ parse_mode: 'HTML' }))
		})

		it('creates a Waiter Invite for a Manager in an active flow', async () => {
			const reply = jest.fn().mockResolvedValue(undefined)
			const createInviteBatch = invitesService.createBatch as jest.Mock
			createInviteBatch.mockResolvedValue([{ inviteeTelegramId: '9876', status: 'created', invite: { id: 'invite-1' } }])
			const ctx = {
				message: { user_shared: { user_id: 9876 } },
				state: {
					user: { id: 'user-1', role: 'manager', businessId: 'business-1', language: 'en' },
					business: { id: 'business-1', name: 'Cafe Addis', status: 'active' },
					isPlatformOwner: false,
					isActiveMember: true,
				},
				session: { inviting: true, inviteRole: 'waiter' },
				reply,
			} as unknown as IdentifiedContext

			await service.handleUserShared(ctx)

			expect(createInviteBatch).toHaveBeenCalledWith({
				inviteeTelegramIds: ['9876'],
				businessId: 'business-1',
				role: 'waiter',
				createdByUserId: 'user-1',
			})
			expect(ctx.session).toMatchObject({ inviting: false, inviteRole: undefined })
		})

		it('creates and reports a named multi-user batch with partial results', async () => {
			const reply = jest.fn().mockResolvedValue(undefined)
			const createInviteBatch = invitesService.createBatch as jest.Mock
			createInviteBatch.mockResolvedValue([
				{ inviteeTelegramId: '9876', status: 'created', invite: { id: 'invite-1' } },
				{ inviteeTelegramId: '9877', status: 'skipped_active_member' },
				{ inviteeTelegramId: '9878', status: 'failed' },
			])
			const ctx = {
				message: {
					users_shared: {
						request_id: 1,
						users: [
							{ user_id: 9876, first_name: 'Abebe', last_name: 'Kebede' },
							{ user_id: 9877, first_name: 'Almaz' },
							{ user_id: 9878, first_name: 'Hana' },
						],
					},
				},
				state: {
					user: { id: 'user-1', role: 'owner', businessId: 'business-1', language: 'en' },
					business: { id: 'business-1', name: 'Cafe Addis', status: 'active' },
					isPlatformOwner: false,
					isActiveMember: true,
				},
				session: { inviting: true, inviteRole: 'manager' },
				reply,
			} as unknown as IdentifiedContext

			await service.handleUserShared(ctx)

			expect(createInviteBatch).toHaveBeenCalledWith({
				inviteeTelegramIds: ['9876', '9877', '9878'],
				businessId: 'business-1',
				role: 'manager',
				createdByUserId: 'user-1',
			})
			expect(reply).toHaveBeenCalledWith(expect.stringContaining('Abebe Kebede'), expect.anything())
			expect(reply).toHaveBeenCalledWith(expect.stringContaining('Almaz'), expect.anything())
			expect(reply).toHaveBeenCalledWith(expect.stringContaining('Hana'), expect.anything())
			expect(ctx.session).toMatchObject({ inviting: false, inviteRole: undefined })
		})
	})
})
