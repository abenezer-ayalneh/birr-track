import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { SharedUser, UsersShared } from '@telegraf/types'
import { Action, Command, Ctx, InjectBot, Next, On, Start, Update } from 'nestjs-telegraf'
import { Markup, Telegraf } from 'telegraf'
import { BotCommand, Message } from 'telegraf/types'

import { InviteBatchOutcome, InvitesService, MAX_INVITE_BATCH_SIZE } from '../../invites/invites.service'
import { describeError } from '../../shared/utils/describe-error.util'
import { SupportedLanguage } from '../../users/entities/user.entity'
import { UsersService } from '../../users/users.service'
import { IdentifiedContext } from '../services/identity.service'
import { TelegramLinksService } from '../services/telegram-links.service'
import { INVITE_ROLE_BUTTONS, TELEGRAM_BOT_NAME } from '../telegram.constants'
import { botText, isSupportedLanguage, LANGUAGE_LABELS } from '../telegram.i18n'
import { renderBotHtml, withTelegramHtml } from '../telegram-html'

interface ConversationSession extends Record<string, unknown> {
	inviting?: boolean
	inviteRole?: 'waiter' | 'manager'
	language?: SupportedLanguage
}

type SelectedTelegramUser = Pick<SharedUser, 'user_id' | 'first_name' | 'last_name'>

type UserPickerMessage = {
	users_shared?: UsersShared
	user_shared?: { user_id: number }
}

@Injectable()
@Update()
export class ConversationService implements OnModuleInit {
	private readonly logger = new Logger(ConversationService.name)

	constructor(
		@InjectBot(TELEGRAM_BOT_NAME) private readonly bot: Telegraf,
		private readonly telegramLinks: TelegramLinksService,
		private readonly usersService: UsersService,
		private readonly invitesService: InvitesService,
	) {}

	/**
	 * Set a global Mini App menu button (the persistent button beside the chat input) on startup so
	 * every user — including the env-bootstrapped Platform Owner, who has no `users` row — can open
	 * the Mini App without depending on a reply keyboard that is only sent on certain flows.
	 */
	async onModuleInit(): Promise<void> {
		await this.configureBotProfile()
		await this.configureDefaultCommands()

		const miniAppUrl = this.telegramLinks.getMiniAppUrl()
		// Telegram only accepts an HTTPS URL for a web_app menu button; skip in local/http dev.
		if (!miniAppUrl.startsWith('https://')) {
			this.logger.warn(`Skipping global Mini App menu button: FRONTEND_APP_URL is not HTTPS (${miniAppUrl})`)
			return
		}

		try {
			await this.bot.telegram.setChatMenuButton({
				menuButton: { type: 'web_app', text: botText('en').openMiniApp, web_app: { url: miniAppUrl } },
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

		if (ctx.state.isPlatformOwner && !ctx.state.user) {
			await ctx.reply(renderBotHtml(t.welcomePlatformOwner, {}), withTelegramHtml(this.getPlatformOwnerMenu(ctx)))
			return
		}

		if (ctx.state.user && ctx.state.business?.status === 'suspended') {
			await ctx.reply(renderBotHtml(t.suspendedBusiness, { businessName: ctx.state.business.name }), withTelegramHtml(this.getSupportKeyboard(ctx)))
			return
		}

		if (ctx.state.business?.status === 'pending') {
			await ctx.reply(
				renderBotHtml(t.pendingBusiness, { businessName: ctx.state.business.name }),
				withTelegramHtml(this.getMiniAppActionKeyboard(ctx, t.viewRegistration)),
			)
			return
		}

		if (ctx.state.business?.status === 'rejected') {
			await ctx.reply(
				this.renderRejectedRegistration(t, ctx.state.business.name, ctx.state.business.rejectionReason),
				withTelegramHtml(this.getMiniAppActionKeyboard(ctx, t.reviseRegistration)),
			)
			return
		}

		if (ctx.payload === 'invite') {
			await this.beginInviteFlow(ctx)
			return
		}

		if (ctx.state.user && ctx.state.business?.status === 'active' && ctx.state.isActiveMember) {
			const greeting = renderBotHtml(t.welcomeRegistered, {
				businessName: ctx.state.business.name,
				role: this.getLocalizedRole(t, ctx.state.user.role),
			})
			await ctx.reply(greeting, withTelegramHtml(this.getMainMenu(ctx)))
			return
		}

		const displayName = this.buildDisplayName(ctx.from.first_name, ctx.from.last_name, ctx.from.username, telegramUserId, t)
		const redeemed = await this.invitesService.redeem(telegramUserId, displayName)

		if (redeemed) {
			if (this.getSession(ctx).language) {
				redeemed.user.language = this.getLanguage(ctx)
				await this.usersService.updateLanguage(redeemed.user.id, redeemed.user.language)
			}
			const confirmMsg = renderBotHtml(t.inviteRedeemed, {
				businessName: redeemed.invite.business.name,
				role: this.getLocalizedRole(t, redeemed.user.role),
			})
			await ctx.reply(confirmMsg, withTelegramHtml(this.getMainMenu(ctx, redeemed.user.role)))

			const inviter = redeemed.invite.createdBy
			const inviterText = botText(inviter.language || 'en')
			const notifyMsg = renderBotHtml(inviterText.inviterNotify, {
				displayName,
				username: ctx.from.username || displayName,
				role: this.getLocalizedRole(inviterText, redeemed.user.role),
				businessName: redeemed.invite.business.name,
			})
			try {
				await ctx.telegram.sendMessage(inviter.telegramUserId, notifyMsg, withTelegramHtml())
			} catch (err) {
				this.logger.error(`Failed to notify inviter ${inviter.id}: ${describeError(err)}`)
			}

			return
		}

		await ctx.reply(renderBotHtml(t.registerOrInvite, {}), withTelegramHtml(this.getRegisterKeyboard(ctx)))
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
		await ctx.reply(renderBotHtml(this.getHelpMessage(ctx), {}), withTelegramHtml())
	}

	@Command('register')
	async handleRegisterCommand(@Ctx() ctx: IdentifiedContext): Promise<void> {
		const telegramUserId = ctx.from?.id?.toString()
		if (!telegramUserId) {
			return
		}
		await this.refreshChatCommands(ctx)

		const t = botText(this.getLanguage(ctx))
		if (ctx.state.isPlatformOwner && !ctx.state.user) {
			await ctx.reply(renderBotHtml(t.welcomePlatformOwner, {}), withTelegramHtml(this.getPlatformOwnerMenu(ctx)))
			return
		}

		if (ctx.state.business?.status === 'suspended') {
			await ctx.reply(renderBotHtml(t.suspendedBusiness, { businessName: ctx.state.business.name }), withTelegramHtml(this.getSupportKeyboard(ctx)))
			return
		}

		if (ctx.state.business?.status === 'pending') {
			await ctx.reply(
				renderBotHtml(t.pendingBusiness, { businessName: ctx.state.business.name }),
				withTelegramHtml(this.getMiniAppActionKeyboard(ctx, t.viewRegistration)),
			)
			return
		}

		if (ctx.state.business?.status === 'rejected') {
			await ctx.reply(
				this.renderRejectedRegistration(t, ctx.state.business.name, ctx.state.business.rejectionReason),
				withTelegramHtml(this.getMiniAppActionKeyboard(ctx, t.reviseRegistration)),
			)
			return
		}

		if (ctx.state.user && ctx.state.business?.status === 'active') {
			await ctx.reply(renderBotHtml(t.alreadyRegistered, { businessName: ctx.state.business.name }), withTelegramHtml(this.getMainMenu(ctx)))
			return
		}

		await ctx.reply(renderBotHtml(t.registerOrInvite, {}), withTelegramHtml(this.getRegisterKeyboard(ctx)))
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
		const t = botText(this.getLanguage(ctx))
		if (ctx.state.business?.status === 'suspended') {
			await ctx.reply(renderBotHtml(t.suspendedBusiness, { businessName: ctx.state.business.name }), withTelegramHtml(this.getSupportKeyboard(ctx)))
			return
		}
		if (ctx.state.business?.status === 'pending') {
			await ctx.reply(
				renderBotHtml(t.pendingBusiness, { businessName: ctx.state.business.name }),
				withTelegramHtml(this.getMiniAppActionKeyboard(ctx, t.viewRegistration)),
			)
			return
		}
		if (ctx.state.business?.status === 'rejected') {
			await ctx.reply(
				this.renderRejectedRegistration(t, ctx.state.business.name, ctx.state.business.rejectionReason),
				withTelegramHtml(this.getMiniAppActionKeyboard(ctx, t.reviseRegistration)),
			)
			return
		}

		if (!ctx.state.user || !ctx.state.isActiveMember || !this.usersService.hasRoleAtLeast(ctx.state.user, 'manager')) {
			await ctx.reply(renderBotHtml(t.onlyManagersInvite, {}), withTelegramHtml())
			return
		}

		const session = (ctx.session || {}) as ConversationSession
		session.inviting = true
		ctx.session = session

		const roleButtons = this.getInvitableRoles(ctx.state.user.role)
		const keyboard = Markup.inlineKeyboard(
			roleButtons.map((role) => [Markup.button.callback(role === 'waiter' ? t.waiter : t.manager, `invite_role_${role}`)]),
		)

		await ctx.reply(renderBotHtml(t.chooseInviteRole, {}), withTelegramHtml(keyboard))
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
		const t = botText(language)
		await ctx.answerCbQuery(t.languageSaved)
		await ctx.editMessageText(renderBotHtml(t.selectionConfirmed, { selection: LANGUAGE_LABELS[language] }), withTelegramHtml({ reply_markup: undefined }))
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
		if (!this.canInviteRole(ctx.state.user?.role, role) || !ctx.state.isActiveMember || ctx.state.business?.status !== 'active') {
			this.clearInviteSession(ctx)
			const t = botText(this.getLanguage(ctx))
			const outcome = role === 'manager' ? t.onlyOwnerInviteManager : t.onlyManagersInvite
			await ctx.answerCbQuery(role === 'manager' ? t.inviteOnlyOwnerCb : t.inviteOnlyManagersCb)
			await ctx.editMessageText(renderBotHtml(outcome, {}), withTelegramHtml({ reply_markup: undefined }))
			return
		}

		const session = (ctx.session || {}) as ConversationSession
		session.inviteRole = role
		session.inviting = true
		ctx.session = session

		const t = botText(this.getLanguage(ctx))
		const roleLabel = this.getLocalizedRole(t, role)
		const userRequest = { max_quantity: MAX_INVITE_BATCH_SIZE, request_name: true }
		const keyboard = Markup.keyboard([[Markup.button.userRequest(t.selectStaffMember, 1, userRequest)]])
			.resize(true)
			.oneTime(true)

		await ctx.answerCbQuery(roleLabel)
		await ctx.editMessageText(renderBotHtml(t.selectionConfirmed, { selection: roleLabel }), withTelegramHtml({ reply_markup: undefined }))
		await ctx.reply(renderBotHtml(t.inviteSelectPrompt, { role: roleLabel }), withTelegramHtml(keyboard))
	}

	@On('text')
	async handleRegistrationText(@Ctx() ctx: IdentifiedContext): Promise<void> {
		await this.refreshChatCommands(ctx)

		const message = ctx.message as Message.TextMessage
		const t = botText(this.getLanguage(ctx))
		if (message.text?.trim() === t.submitReceipt || message.text?.trim() === '📸 Submit Receipt') {
			if (!ctx.state.user || ctx.state.business?.status !== 'active') {
				await this.handleStart(ctx)
				return
			}
			await ctx.reply(renderBotHtml(t.submitReceiptPrompt, {}), withTelegramHtml())
			return
		}

		if (message.text?.trim() === t.inviteCommand) {
			await this.beginInviteFlow(ctx)
			return
		}

		// Business registration is owned by the Mini App so Telegram's signed
		// initData is validated for every write. Keep this handler for receipt-menu
		// text compatibility, but never accept a Business name from chat text.
	}

	@On('message')
	async handleUserShared(@Ctx() ctx: IdentifiedContext, @Next() next?: () => Promise<void>): Promise<void> {
		await this.refreshChatCommands(ctx)

		const selectedUsers = this.getSelectedUsers(ctx.message as unknown)
		if (selectedUsers.length === 0) {
			await next?.()
			return
		}

		const session = this.getSession(ctx)
		if (!session.inviting || !session.inviteRole) {
			await next?.()
			return
		}

		const role = session.inviteRole

		if (ctx.state.business?.status !== 'active') {
			this.clearInviteSession(ctx)
			await this.beginInviteFlow(ctx)
			return
		}

		if (!ctx.state.user || !ctx.state.isActiveMember) {
			this.clearInviteSession(ctx)
			await ctx.reply(renderBotHtml(botText(this.getLanguage(ctx)).notRegistered, {}), withTelegramHtml())
			return
		}

		if (!this.canInviteRole(ctx.state.user.role, role)) {
			this.clearInviteSession(ctx)
			const t = botText(this.getLanguage(ctx))
			await ctx.reply(renderBotHtml(role === 'manager' ? t.onlyOwnerInviteManager : t.onlyManagersInvite, {}), withTelegramHtml(Markup.removeKeyboard()))
			return
		}

		try {
			const outcomes = await this.invitesService.createBatch({
				inviteeTelegramIds: selectedUsers.map((user) => String(user.user_id)),
				businessId: ctx.state.user.businessId,
				role,
				createdByUserId: ctx.state.user.id,
			})

			this.clearInviteSession(ctx)

			const t = botText(this.getLanguage(ctx))
			const confirmMsg = this.formatInviteBatchResult(t, this.getLocalizedRole(t, role), selectedUsers, outcomes)
			await ctx.reply(confirmMsg, withTelegramHtml(Markup.removeKeyboard()))

			this.logger.log(
				`Invite batch processed by ${ctx.state.user.id}: ${outcomes.filter((outcome) => outcome.status === 'created').length} created, ${outcomes.length} selected (${role})`,
			)
		} catch (err) {
			this.clearInviteSession(ctx)
			await ctx.reply(renderBotHtml(botText(this.getLanguage(ctx)).failedCreateInvite, {}), withTelegramHtml(Markup.removeKeyboard()))
			this.logger.error(`Failed to create invite batch: ${describeError(err)}`)
		}
	}

	private getSelectedUsers(message: unknown): SelectedTelegramUser[] {
		const typedMessage = message as UserPickerMessage
		if (typedMessage.users_shared?.users) {
			return typedMessage.users_shared.users
		}
		if (typedMessage.user_shared) {
			return [typedMessage.user_shared]
		}
		return []
	}

	private formatInviteBatchResult(
		t: ReturnType<typeof botText>,
		role: string,
		selectedUsers: SelectedTelegramUser[],
		outcomes: InviteBatchOutcome[],
	): string {
		const namesByTelegramId = new Map(selectedUsers.map((user) => [String(user.user_id), this.formatSelectedUserName(t, user)]))
		const formatNames = (status: InviteBatchOutcome['status']) =>
			outcomes
				.filter((outcome) => outcome.status === status)
				.map(
					(outcome) =>
						namesByTelegramId.get(outcome.inviteeTelegramId) ??
						renderBotHtml(t.telegramUserFallback, { telegramUserId: outcome.inviteeTelegramId }),
				)
				.join(', ')

		const createdCount = outcomes.filter((outcome) => outcome.status === 'created').length
		const title = createdCount === outcomes.length ? t.inviteResultCreated : createdCount > 0 ? t.inviteResultPartial : t.inviteResultNone
		const lines: string[] = title ? [renderBotHtml(title, {}), ''] : []
		const createdNames = formatNames('created')
		if (createdNames) {
			lines.push(renderBotHtml(t.inviteSent, { count: createdCount, names: createdNames, role }))
		}
		const skippedNames = formatNames('skipped_active_member')
		if (skippedNames) {
			lines.push(
				renderBotHtml(t.inviteSkipped, {
					count: outcomes.filter((outcome) => outcome.status === 'skipped_active_member').length,
					names: skippedNames,
				}),
			)
		}
		const failedNames = formatNames('failed')
		if (failedNames) {
			lines.push(
				renderBotHtml(t.inviteBatchFailed, {
					count: outcomes.filter((outcome) => outcome.status === 'failed').length,
					names: failedNames,
				}),
			)
		}

		return lines.join('\n')
	}

	private formatSelectedUserName(t: ReturnType<typeof botText>, user: SelectedTelegramUser): string {
		const name = [user.first_name, user.last_name].filter((part): part is string => Boolean(part?.trim())).join(' ')
		return name || renderBotHtml(t.telegramUserFallback, { telegramUserId: user.user_id })
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

	private getMainMenu(ctx: IdentifiedContext, role = ctx.state.user?.role) {
		const t = botText(this.getLanguage(ctx))
		const rows = [[Markup.button.text(t.submitReceipt), Markup.button.webApp(t.openMiniApp, this.telegramLinks.getMiniAppUrl())]]
		if (this.getInvitableRoles(role).length > 0) {
			rows.push([Markup.button.text(t.inviteCommand)])
		}
		return Markup.keyboard(rows).resize()
	}

	private getRegisterKeyboard(ctx: IdentifiedContext) {
		const t = botText(this.getLanguage(ctx))
		return this.getMiniAppActionKeyboard(ctx, t.registerBusiness)
	}

	private getMiniAppActionKeyboard(_ctx: IdentifiedContext, label: string) {
		return Markup.inlineKeyboard([[Markup.button.webApp(label, this.telegramLinks.getMiniAppUrl())]])
	}

	private getSupportKeyboard(ctx: IdentifiedContext) {
		return Markup.inlineKeyboard([[Markup.button.url(botText(this.getLanguage(ctx)).contactSupport, this.telegramLinks.getSupportUrl())]])
	}

	private getPlatformOwnerMenu(ctx: IdentifiedContext) {
		return this.getMiniAppActionKeyboard(ctx, botText(this.getLanguage(ctx)).openMiniApp)
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
		await ctx.reply(renderBotHtml(botText(this.getLanguage(ctx)).languagePrompt, {}), withTelegramHtml(keyboard))
	}

	private getLocalizedRole(t: ReturnType<typeof botText>, role: string): string {
		if (role === 'waiter') return t.waiter
		if (role === 'manager') return t.manager
		return t.owner
	}

	private renderRejectedRegistration(t: ReturnType<typeof botText>, businessName: string, reason: string | null): string {
		return renderBotHtml(t.ownerRejected, {
			businessName,
			reason: reason ? `${t.reasonPrefix}${reason}` : t.reasonNotProvided,
			nextStep: t.rejectedNextStep,
		})
	}

	private buildDisplayName(
		firstName: string | undefined,
		lastName: string | undefined,
		username: string | undefined,
		telegramUserId: string,
		t: ReturnType<typeof botText>,
	): string {
		const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
		if (fullName) {
			return fullName
		}
		if (username) {
			return username
		}
		return renderBotHtml(t.telegramUserFallback, { telegramUserId })
	}
}
