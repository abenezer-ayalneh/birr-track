import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Action, Command, Ctx, InjectBot, Next, On, Start, Update } from 'nestjs-telegraf'
import { Markup, Telegraf } from 'telegraf'
import { BotCommand, Message, User as TelegramUser } from 'telegraf/types'

import { BusinessesService } from '../../businesses/businesses.service'
import { Business } from '../../businesses/entities/business.entity'
import { InvitesService } from '../../invites/invites.service'
import { describeError } from '../../shared/utils/describe-error.util'
import { SupportedLanguage } from '../../users/entities/user.entity'
import { UsersService } from '../../users/users.service'
import { IdentifiedContext } from '../services/identity.service'
import { INVITE_ROLE_BUTTONS, TELEGRAM_BOT_NAME } from '../telegram.constants'
import { botText, formatBotText, isSupportedLanguage, LANGUAGE_LABELS } from '../telegram.i18n'

interface ConversationSession extends Record<string, unknown> {
	registering?: boolean
	inviting?: boolean
	inviteRole?: 'waiter' | 'manager'
	language?: SupportedLanguage
}

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
		if (!this.hasLanguage(ctx)) {
			await this.askLanguage(ctx)
			return
		}
		const t = botText(this.getLanguage(ctx))

		if (ctx.payload === 'invite') {
			await this.beginInviteFlow(ctx)
			return
		}

		if (ctx.state.user) {
			const greeting = formatBotText(t.welcomeRegistered, { businessName: ctx.state.business?.name || 'your business' })
			await ctx.reply(greeting, this.getMainMenu(ctx))
			return
		}

		// The Platform Owner is identified by env (PLATFORM_OWNER_TELEGRAM_ID) and has no `users` row,
		// so without this branch they would fall through to the register-a-business flow. Greet them
		// and surface the admin panel instead.
		if (ctx.state.isPlatformOwner) {
			await ctx.reply(t.welcomePlatformOwner, this.getPlatformOwnerMenu(ctx))
			return
		}

		const displayName = this.buildDisplayName(ctx.from.first_name, ctx.from.last_name, ctx.from.username)
		const redeemed = await this.invitesService.redeem(telegramUserId, displayName)

		if (redeemed) {
			if (this.getSession(ctx).language) {
				redeemed.user.language = this.getLanguage(ctx)
				await this.usersService.updateLanguage(redeemed.user.id, redeemed.user.language)
			}
			const confirmMsg = formatBotText(t.inviteRedeemed, { businessId: redeemed.user.businessId, role: redeemed.user.role })
			await ctx.reply(confirmMsg, this.getMainMenu(ctx))

			const inviter = redeemed.invite.createdBy
			const notifyMsg = formatBotText(t.inviterNotify, { displayName, username: ctx.from.username || 'no username', role: redeemed.user.role })
			try {
				await ctx.telegram.sendMessage(inviter.telegramUserId, notifyMsg)
			} catch (err) {
				this.logger.error(`Failed to notify inviter ${inviter.id}: ${describeError(err)}`)
			}

			return
		}

		await ctx.reply(t.registerOrInvite, this.getRegisterOrInviteKeyboard(ctx))
	}

	@Command('language')
	async handleLanguageCommand(@Ctx() ctx: IdentifiedContext): Promise<void> {
		await this.askLanguage(ctx)
	}

	@Command('lang')
	async handleLangCommand(@Ctx() ctx: IdentifiedContext): Promise<void> {
		await this.askLanguage(ctx)
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
			const t = botText(this.getLanguage(ctx))
			await ctx.reply(formatBotText(t.alreadyRegistered, { businessName: ctx.state.business?.name || 'Birr Track' }))
			return
		}

		const session = (ctx.session || {}) as ConversationSession
		session.registering = true
		ctx.session = session
		await ctx.reply(botText(this.getLanguage(ctx)).askBusinessName)
	}

	@Command('invite')
	async handleInviteCommand(@Ctx() ctx: IdentifiedContext): Promise<void> {
		const telegramUserId = ctx.from?.id?.toString()
		if (!telegramUserId) {
			return
		}
		await this.refreshChatCommands(ctx)
		await this.beginInviteFlow(ctx)
	}

	private async beginInviteFlow(ctx: IdentifiedContext): Promise<void> {
		if (!ctx.state.user || !ctx.state.isActiveMember || !this.usersService.hasRoleAtLeast(ctx.state.user, 'manager')) {
			await ctx.reply(botText(this.getLanguage(ctx)).onlyManagersInvite)
			return
		}

		const session = (ctx.session || {}) as ConversationSession
		session.inviting = true
		ctx.session = session

		const roleButtons = this.getInvitableRoles(ctx.state.user.role)
		const t = botText(this.getLanguage(ctx))
		const keyboard = Markup.inlineKeyboard(
			roleButtons.map((role) => [Markup.button.callback(role === 'waiter' ? t.waiter : t.manager, `invite_role_${role}`)]),
		)

		await ctx.reply(t.chooseInviteRole, keyboard)
	}

	@Action(/^language_(en|am)$/)
	async handleCallbackQuery(@Ctx() ctx: IdentifiedContext): Promise<void> {
		const cbQuery = ctx.callbackQuery as { data?: string }
		const language = cbQuery?.data?.replace('language_', '')
		if (!isSupportedLanguage(language)) {
			return
		}
		const shouldContinueStart = !this.hasLanguage(ctx)
		const session = this.getSession(ctx)
		session.language = language
		ctx.session = session
		if (ctx.state.user) {
			await this.usersService.updateLanguage(ctx.state.user.id, language)
			ctx.state.user.language = language
		}
		await this.refreshChatCommands(ctx)
		await ctx.answerCbQuery(botText(language).languageSaved)
		await ctx.reply(botText(language).languageSaved)
		if (shouldContinueStart) {
			await this.handleStart(ctx)
		}
	}

	@Action(/^invite_role_\w+$/)
	async handleInviteRoleCallbackQuery(@Ctx() ctx: IdentifiedContext): Promise<void> {
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
		if (!this.canInviteRole(ctx.state.user?.role, role) || !ctx.state.isActiveMember) {
			this.clearInviteSession(ctx)
			await ctx.answerCbQuery()
			const t = botText(this.getLanguage(ctx))
			await ctx.reply(role === 'manager' ? t.onlyOwnerInviteManager : t.onlyManagersInvite, Markup.removeKeyboard())
			return
		}

		const session = (ctx.session || {}) as ConversationSession
		session.inviteRole = role
		session.inviting = true
		ctx.session = session

		const t = botText(this.getLanguage(ctx))
		const keyboard = Markup.keyboard([[Markup.button.userRequest(t.selectStaffMember, 1)]])
			.resize(true)
			.oneTime(true)

		await ctx.reply(formatBotText(t.inviteSelectPrompt, { role }), keyboard)
		await ctx.answerCbQuery()
	}

	@On('text')
	async handleRegistrationText(@Ctx() ctx: IdentifiedContext): Promise<void> {
		await this.refreshChatCommands(ctx)

		const message = ctx.message as Message.TextMessage
		const t = botText(this.getLanguage(ctx))
		if (message.text?.trim() === t.submitReceipt || message.text?.trim() === '📸 Submit Receipt') {
			await ctx.reply(t.submitReceiptPrompt)
			return
		}

		const session = (ctx.session || {}) as ConversationSession
		if (!session?.registering) {
			return
		}

		const businessName = message.text?.trim()
		const telegramUserId = ctx.from?.id?.toString()

		if (!businessName || !telegramUserId || !ctx.from) {
			await ctx.reply(t.businessNameEmpty)
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
			language: this.getLanguage(ctx),
		})

		business.ownerUserId = user.id
		await this.businessesService.save(business)

		session.registering = false
		ctx.session = session
		await ctx.reply(t.registerSuccess)

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
		const session = this.getSession(ctx)
		if (!session.inviting || !session.inviteRole) {
			await next?.()
			return
		}

		const role = session.inviteRole

		if (!ctx.state.user || !ctx.state.isActiveMember) {
			this.clearInviteSession(ctx)
			await ctx.reply(botText(this.getLanguage(ctx)).notRegistered)
			return
		}

		if (!this.canInviteRole(ctx.state.user.role, role)) {
			this.clearInviteSession(ctx)
			const t = botText(this.getLanguage(ctx))
			await ctx.reply(role === 'manager' ? t.onlyOwnerInviteManager : t.onlyManagersInvite, Markup.removeKeyboard())
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

			const t = botText(this.getLanguage(ctx))
			const confirmMsg = formatBotText(t.inviteSent, { role })
			await ctx.reply(confirmMsg, Markup.removeKeyboard())

			this.logger.log(`Invite ${invite.id} created by ${ctx.state.user.id} for user ${selectedUserId} (${role})`)
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : botText(this.getLanguage(ctx)).failedCreateInvite
			await ctx.reply(`Error: ${errorMsg}`, Markup.removeKeyboard())
			this.logger.error(`Failed to create invite: ${describeError(err)}`)
		}
	}

	private getInvitableRoles(role: string | undefined): Array<'waiter' | 'manager'> {
		if (role !== 'manager' && role !== 'owner') {
			return []
		}
		return INVITE_ROLE_BUTTONS[role]
	}

	private canInviteRole(actorRole: string | undefined, inviteRole: 'waiter' | 'manager'): boolean {
		return this.getInvitableRoles(actorRole).includes(inviteRole)
	}

	private clearInviteSession(ctx: IdentifiedContext): void {
		const session = this.getSession(ctx)
		session.inviting = false
		session.inviteRole = undefined
		ctx.session = session
	}

	private async configureBotProfile(): Promise<void> {
		try {
			for (const language of ['en', 'am'] as const) {
				const t = botText(language)
				await this.bot.telegram.setMyShortDescription(t.shortDescription, language === 'en' ? undefined : language)
				await this.bot.telegram.setMyDescription(t.description, language === 'en' ? undefined : language)
			}
			this.logger.log('Bot profile descriptions configured')
		} catch (err) {
			this.logger.error(`Failed to configure bot profile descriptions: ${describeError(err)}`)
		}
	}

	private async configureDefaultCommands(): Promise<void> {
		try {
			await this.bot.telegram.setMyCommands(botText('en').commands.unknown)
			await this.bot.telegram.setMyCommands(botText('am').commands.unknown, { language_code: 'am' })
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
				language_code: this.getLanguage(ctx) === 'en' ? undefined : this.getLanguage(ctx),
			})
		} catch (err) {
			this.logger.error(`Failed to refresh chat commands for chat ${ctx.chat.id}: ${describeError(err)}`)
		}
	}

	private getCommandsForContext(ctx: IdentifiedContext): BotCommand[] {
		const commands = botText(this.getLanguage(ctx)).commands
		if (ctx.state.isPlatformOwner && !ctx.state.user) {
			return commands.platform_owner
		}

		switch (ctx.state.user?.role) {
			case 'owner':
				return commands.owner
			case 'manager':
				return commands.manager
			case 'waiter':
				return commands.waiter
			default:
				return commands.unknown
		}
	}

	private getHelpMessage(ctx: IdentifiedContext): string {
		const help = botText(this.getLanguage(ctx)).help
		if (ctx.state.isPlatformOwner && !ctx.state.user) {
			return help.platform_owner
		}

		switch (ctx.state.user?.role) {
			case 'owner':
				return help.owner
			case 'manager':
				return help.manager
			case 'waiter':
				return help.waiter
			default:
				return help.unknown
		}
	}

	private getMainMenu(ctx: IdentifiedContext) {
		const t = botText(this.getLanguage(ctx))
		return Markup.keyboard([[Markup.button.text(t.submitReceipt), Markup.button.text(t.inviteCommand)]]).resize()
	}

	private getRegisterOrInviteKeyboard(ctx: IdentifiedContext) {
		const t = botText(this.getLanguage(ctx))
		return Markup.keyboard([[Markup.button.text('/register'), Markup.button.text(t.askManagerInvite)]]).resize()
	}

	private getPlatformOwnerMenu(ctx: IdentifiedContext) {
		const miniAppUrl = this.configService.get<string>('FRONTEND_APP_URL', 'http://localhost:3003')
		return Markup.inlineKeyboard([[Markup.button.webApp(botText(this.getLanguage(ctx)).openMiniApp, miniAppUrl)]])
	}

	private getSession(ctx: IdentifiedContext): ConversationSession {
		return (ctx.session || {}) as ConversationSession
	}

	private hasLanguage(ctx: IdentifiedContext): boolean {
		return Boolean(ctx.state.user?.language || this.getSession(ctx).language)
	}

	private getLanguage(ctx: IdentifiedContext): SupportedLanguage {
		return ctx.state.user?.language || this.getSession(ctx).language || 'en'
	}

	private async askLanguage(ctx: IdentifiedContext): Promise<void> {
		const keyboard = Markup.inlineKeyboard([
			[Markup.button.callback(LANGUAGE_LABELS.en, 'language_en'), Markup.button.callback(LANGUAGE_LABELS.am, 'language_am')],
		])
		await ctx.reply(botText(this.getLanguage(ctx)).languagePrompt, keyboard)
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
		const t = botText('en')
		const message = formatBotText(t.newRegistration, {
			businessName: business.name,
			registrantName: `${registrant.first_name} ${registrant.last_name || ''}`.trim(),
			profileLink,
		})

		const approveBtn = Markup.button.callback(t.approveButton, `approve_biz_${business.id}`)
		const rejectBtn = Markup.button.callback(t.rejectButton, `reject_biz_${business.id}`)

		try {
			await ctx.telegram.sendMessage(platformOwnerId, message, Markup.inlineKeyboard([[approveBtn, rejectBtn]]))
			this.logger.log(`Notified Platform Owner of business registration ${business.id}`)
		} catch (err) {
			this.logger.error(`Failed to notify Platform Owner: ${describeError(err)}`)
		}
	}
}
