import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Action, Command, Ctx, InjectBot, Next, On, Start, Update } from 'nestjs-telegraf'
import { Markup, Telegraf } from 'telegraf'
import { BotCommand, Message, User as TelegramUser } from 'telegraf/types'

import { BusinessesService } from '../../businesses/businesses.service'
import { Business } from '../../businesses/entities/business.entity'
import { InvitesService } from '../../invites/invites.service'
import { describeError } from '../../shared/utils/describe-error.util'
import { UsersService } from '../../users/users.service'
import { IdentifiedContext } from '../services/identity.service'
import {
	BOT_DESCRIPTION,
	BOT_SHORT_DESCRIPTION,
	HELP_MESSAGE_MANAGER,
	HELP_MESSAGE_OWNER,
	HELP_MESSAGE_PLATFORM_OWNER,
	HELP_MESSAGE_UNKNOWN,
	HELP_MESSAGE_WAITER,
	INVITE_ROLE_BUTTONS,
	REGISTER_OR_INVITE_MESSAGE,
	REGISTER_SUCCESS_MESSAGE,
	TELEGRAM_BOT_NAME,
	WELCOME_MESSAGE_PLATFORM_OWNER,
	WELCOME_MESSAGE_REGISTERED,
} from '../telegram.constants'

interface ConversationSession extends Record<string, unknown> {
	registering?: boolean
	inviting?: boolean
	inviteRole?: 'waiter' | 'manager'
}

const COMMANDS_UNKNOWN: BotCommand[] = [
	{ command: 'start', description: 'Start or refresh your session' },
	{ command: 'help', description: 'Show what this bot can do' },
	{ command: 'register', description: 'Register a Business' },
]

const COMMANDS_WAITER: BotCommand[] = [
	{ command: 'start', description: 'Refresh your menu' },
	{ command: 'help', description: 'Show help' },
]

const COMMANDS_MANAGER: BotCommand[] = [
	...COMMANDS_WAITER,
	{ command: 'invite', description: 'Invite a Waiter' },
]

const COMMANDS_OWNER: BotCommand[] = [
	...COMMANDS_WAITER,
	{ command: 'invite', description: 'Invite a Waiter or Manager' },
]

const COMMANDS_PLATFORM_OWNER = COMMANDS_WAITER

@Injectable()
@Update()
export class ConversationService implements OnModuleInit {
	private readonly logger = new Logger(ConversationService.name)

	constructor(
		@InjectBot(TELEGRAM_BOT_NAME) private readonly bot: Telegraf,
		private readonly configService: ConfigService,
		private readonly usersService: UsersService,
		private readonly businessesService: BusinessesService,
		private readonly invitesService: InvitesService,
	) {}

	/**
	 * Set a global Mini App menu button (the persistent button beside the chat input) on startup so
	 * every user — including the env-bootstrapped Platform Owner, who has no `users` row — can open
	 * the admin panel without depending on a reply keyboard that is only sent on certain flows.
	 */
	async onModuleInit(): Promise<void> {
		await this.configureBotProfile()
		await this.configureDefaultCommands()

		const miniAppUrl = this.configService.get<string>('FRONTEND_APP_URL', 'http://localhost:3003')
		// Telegram only accepts an HTTPS URL for a web_app menu button; skip in local/http dev.
		if (!miniAppUrl.startsWith('https://')) {
			this.logger.warn(`Skipping global Mini App menu button: FRONTEND_APP_URL is not HTTPS (${miniAppUrl})`)
			return
		}

		try {
			await this.bot.telegram.setChatMenuButton({
				menuButton: { type: 'web_app', text: 'Open App', web_app: { url: miniAppUrl } },
			})
			this.logger.log('Global Mini App menu button configured')
		} catch (err) {
			this.logger.error(`Failed to set global Mini App menu button: ${describeError(err)}`)
		}
	}

	@Start()
	async handleStart(@Ctx() ctx: IdentifiedContext): Promise<void> {
		const telegramUserId = ctx.from?.id?.toString()
		if (!telegramUserId || !ctx.from) {
			return
		}
		await this.refreshChatCommands(ctx)

		if (ctx.state.user) {
			const greeting = WELCOME_MESSAGE_REGISTERED.replace('{businessName}', ctx.state.business?.name || 'your business')
			await ctx.reply(greeting, this.getMainMenu())
			return
		}

		// The Platform Owner is identified by env (PLATFORM_OWNER_TELEGRAM_ID) and has no `users` row,
		// so without this branch they would fall through to the register-a-business flow. Greet them
		// and surface the admin panel instead.
		if (ctx.state.isPlatformOwner) {
			await ctx.reply(WELCOME_MESSAGE_PLATFORM_OWNER, this.getPlatformOwnerMenu())
			return
		}

		const displayName = this.buildDisplayName(ctx.from.first_name, ctx.from.last_name, ctx.from.username)
		const redeemed = await this.invitesService.redeem(telegramUserId, displayName)

		if (redeemed) {
			const confirmMsg = `Welcome to Birr Track! You've been added to ${redeemed.user.businessId} as a ${redeemed.user.role}. Open the Mini App to get started.`
			await ctx.reply(confirmMsg, this.getMainMenu())

			const inviter = redeemed.invite.createdBy
			const notifyMsg = `${displayName} (@${ctx.from.username || 'no username'}) has accepted your invite and joined as a ${redeemed.user.role}.`
			try {
				await ctx.telegram.sendMessage(inviter.telegramUserId, notifyMsg)
			} catch (err) {
				this.logger.error(`Failed to notify inviter ${inviter.id}: ${describeError(err)}`)
			}

			return
		}

		await ctx.reply(REGISTER_OR_INVITE_MESSAGE, this.getRegisterOrInviteKeyboard())
	}

	@Command('help')
	async handleHelpCommand(@Ctx() ctx: IdentifiedContext): Promise<void> {
		await this.refreshChatCommands(ctx)
		await ctx.reply(this.getHelpMessage(ctx))
	}

	@Command('register')
	async handleRegisterCommand(@Ctx() ctx: IdentifiedContext): Promise<void> {
		const telegramUserId = ctx.from?.id?.toString()
		if (!telegramUserId) {
			return
		}
		await this.refreshChatCommands(ctx)

		if (ctx.state.user) {
			await ctx.reply('You are already registered with ' + (ctx.state.business?.name || 'Birr Track') + '.')
			return
		}

		const session = (ctx.session || {}) as ConversationSession
		session.registering = true
		ctx.session = session
		await ctx.reply('What is your business name?')
	}

	@Command('invite')
	async handleInviteCommand(@Ctx() ctx: IdentifiedContext): Promise<void> {
		const telegramUserId = ctx.from?.id?.toString()
		if (!telegramUserId) {
			return
		}
		await this.refreshChatCommands(ctx)

		if (!ctx.state.user || !this.usersService.hasRoleAtLeast(ctx.state.user, 'manager')) {
			await ctx.reply('Only managers and owners can invite staff.')
			return
		}

		const session = (ctx.session || {}) as ConversationSession
		session.inviting = true
		ctx.session = session

		const roleButtons = INVITE_ROLE_BUTTONS[ctx.state.user.role as 'manager' | 'owner']
		const keyboard = Markup.inlineKeyboard(
			roleButtons.map((role) => [Markup.button.callback(role === 'waiter' ? 'Waiter' : 'Manager', `invite_role_${role}`)]),
		)

		await ctx.reply('What role would you like to invite?', keyboard)
	}

	@Action(/^invite_role_\w+$/)
	async handleCallbackQuery(@Ctx() ctx: IdentifiedContext): Promise<void> {
		const cbQuery = ctx.callbackQuery as { data?: string }
		const data = cbQuery?.data
		if (!data?.startsWith('invite_role_')) {
			return
		}

		const match = data.match(/^invite_role_(\w+)$/)
		if (!match || !match[1]) {
			return
		}

		const role = match[1] as 'waiter' | 'manager'
		const session = (ctx.session || {}) as ConversationSession
		session.inviteRole = role
		session.inviting = true
		ctx.session = session

		const keyboard = Markup.keyboard([[Markup.button.userRequest('Select staff member', 1)]])
			.resize(true)
			.oneTime(true)

		await ctx.reply(`Now select the staff member to invite as a ${role}:`, keyboard)
		await ctx.answerCbQuery()
	}

	@On('text')
	async handleRegistrationText(@Ctx() ctx: IdentifiedContext): Promise<void> {
		await this.refreshChatCommands(ctx)

		const message = ctx.message as Message.TextMessage
		if (message.text?.trim() === '📸 Submit Receipt') {
			await ctx.reply('Attach or take a receipt photo and send it here.')
			return
		}

		const session = (ctx.session || {}) as ConversationSession
		if (!session?.registering) {
			return
		}

		const businessName = message.text?.trim()
		const telegramUserId = ctx.from?.id?.toString()

		if (!businessName || !telegramUserId || !ctx.from) {
			await ctx.reply('Business name cannot be empty. Please try again.')
			return
		}

		const business = await this.businessesService.create({
			name: businessName,
		})

		const displayName = this.buildDisplayName(ctx.from.first_name, ctx.from.last_name, ctx.from.username)
		const user = await this.usersService.joinBusiness({
			telegramUserId,
			displayName,
			businessId: business.id,
			role: 'owner',
		})

		business.ownerUserId = user.id
		await this.businessesService.save(business)

		session.registering = false
		ctx.session = session
		await ctx.reply(REGISTER_SUCCESS_MESSAGE)

		await this.notifyPlatformOwner(ctx, business, ctx.from)
	}

	@On('message')
	async handleUserShared(@Ctx() ctx: IdentifiedContext, @Next() next?: () => Promise<void>): Promise<void> {
		await this.refreshChatCommands(ctx)

		const message = ctx.message as unknown
		const typedMsg = message as { user_shared?: { user_id: number } }
		if (!typedMsg?.user_shared) {
			await next?.()
			return
		}

		const selectedUserId = String(typedMsg.user_shared.user_id)
		const session = (ctx.session || {}) as ConversationSession
		const role = session?.inviteRole || 'waiter'

		if (!ctx.state.user) {
			await ctx.reply('You are not registered.')
			return
		}

		try {
			const invite = await this.invitesService.create({
				inviteeTelegramId: selectedUserId,
				businessId: ctx.state.user.businessId,
				role,
				createdByUserId: ctx.state.user.id,
			})

			session.inviting = false
			session.inviteRole = undefined
			ctx.session = session

			const confirmMsg = `Invite sent! The staff member will be added as a ${role} when they start the bot.`
			await ctx.reply(confirmMsg, Markup.removeKeyboard())

			this.logger.log(`Invite ${invite.id} created by ${ctx.state.user.id} for user ${selectedUserId} (${role})`)
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : 'Failed to create invite'
			await ctx.reply(`Error: ${errorMsg}`, Markup.removeKeyboard())
			this.logger.error(`Failed to create invite: ${describeError(err)}`)
		}
	}

	private async configureBotProfile(): Promise<void> {
		try {
			await this.bot.telegram.setMyShortDescription(BOT_SHORT_DESCRIPTION)
			await this.bot.telegram.setMyDescription(BOT_DESCRIPTION)
			this.logger.log('Bot profile descriptions configured')
		} catch (err) {
			this.logger.error(`Failed to configure bot profile descriptions: ${describeError(err)}`)
		}
	}

	private async configureDefaultCommands(): Promise<void> {
		try {
			await this.bot.telegram.setMyCommands(COMMANDS_UNKNOWN)
			this.logger.log('Default bot commands configured')
		} catch (err) {
			this.logger.error(`Failed to configure default bot commands: ${describeError(err)}`)
		}
	}

	private async refreshChatCommands(ctx: IdentifiedContext): Promise<void> {
		if (!ctx.chat?.id) {
			return
		}

		try {
			await this.bot.telegram.setMyCommands(this.getCommandsForContext(ctx), {
				scope: { type: 'chat', chat_id: ctx.chat.id },
			})
		} catch (err) {
			this.logger.error(`Failed to refresh chat commands for chat ${ctx.chat.id}: ${describeError(err)}`)
		}
	}

	private getCommandsForContext(ctx: IdentifiedContext): BotCommand[] {
		if (ctx.state.isPlatformOwner && !ctx.state.user) {
			return COMMANDS_PLATFORM_OWNER
		}

		switch (ctx.state.user?.role) {
			case 'owner':
				return COMMANDS_OWNER
			case 'manager':
				return COMMANDS_MANAGER
			case 'waiter':
				return COMMANDS_WAITER
			default:
				return COMMANDS_UNKNOWN
		}
	}

	private getHelpMessage(ctx: IdentifiedContext): string {
		if (ctx.state.isPlatformOwner && !ctx.state.user) {
			return HELP_MESSAGE_PLATFORM_OWNER
		}

		switch (ctx.state.user?.role) {
			case 'owner':
				return HELP_MESSAGE_OWNER
			case 'manager':
				return HELP_MESSAGE_MANAGER
			case 'waiter':
				return HELP_MESSAGE_WAITER
			default:
				return HELP_MESSAGE_UNKNOWN
		}
	}

	private getMainMenu() {
		return Markup.keyboard([[Markup.button.text('📸 Submit Receipt'), Markup.button.text('/invite')]]).resize()
	}

	private getRegisterOrInviteKeyboard() {
		return Markup.keyboard([[Markup.button.text('/register'), Markup.button.text('Ask your manager for an invite')]]).resize()
	}

	private getPlatformOwnerMenu() {
		const miniAppUrl = this.configService.get<string>('FRONTEND_APP_URL', 'http://localhost:3003')
		return Markup.inlineKeyboard([[Markup.button.webApp('Open Admin Panel', miniAppUrl)]])
	}

	private buildDisplayName(firstName?: string, lastName?: string, username?: string): string {
		const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
		if (fullName) {
			return fullName
		}
		if (username) {
			return username
		}
		return 'Unknown User'
	}

	private async notifyPlatformOwner(ctx: IdentifiedContext, business: Business, registrant: TelegramUser): Promise<void> {
		const platformOwnerId = this.configService.get<string>('PLATFORM_OWNER_TELEGRAM_ID')
		if (!platformOwnerId) {
			return
		}

		const profileLink = registrant.username ? `@${registrant.username}` : `Telegram ID: ${registrant.id}`
		const message = `New business registration:\n\nBusiness: ${business.name}\nRegistrant: ${registrant.first_name} ${registrant.last_name || ''} (${profileLink})\n\nApprove or reject below.`

		const approveBtn = Markup.button.callback('✅ Approve', `approve_biz_${business.id}`)
		const rejectBtn = Markup.button.callback('❌ Reject', `reject_biz_${business.id}`)

		try {
			await ctx.telegram.sendMessage(platformOwnerId, message, Markup.inlineKeyboard([[approveBtn, rejectBtn]]))
			this.logger.log(`Notified Platform Owner of business registration ${business.id}`)
		} catch (err) {
			this.logger.error(`Failed to notify Platform Owner: ${describeError(err)}`)
		}
	}
}
