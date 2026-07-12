import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Action, Ctx, Update } from 'nestjs-telegraf'

import { RegistrationsService } from '../../registrations/registrations.service'
import { describeError } from '../../shared/utils/describe-error.util'
import { SupportedLanguage } from '../../users/entities/user.entity'
import { UsersService } from '../../users/users.service'
import { IdentifiedContext } from '../services/identity.service'
import { botText, formatBotText, isSupportedLanguage } from '../telegram.i18n'

@Injectable()
@Update()
export class RegistrationService {
	private readonly logger = new Logger(RegistrationService.name)

	constructor(
		private readonly registrationsService: RegistrationsService,
		private readonly usersService: UsersService,
	) {}

	@Action([/^approve_biz_/, /^reject_biz_/])
	async handleCallbackQuery(@Ctx() ctx: IdentifiedContext): Promise<void> {
		const cbQuery = ctx.callbackQuery as { data?: string }
		const data = cbQuery?.data
		if (!data) {
			return
		}

		if (data.startsWith('approve_biz_')) {
			await this.handleApproveBusiness(ctx, data)
		} else if (data.startsWith('reject_biz_')) {
			await this.handleRejectBusiness(ctx, data)
		}
	}

	private async handleApproveBusiness(@Ctx() ctx: IdentifiedContext, data: string): Promise<void> {
		const businessId = data.replace('approve_biz_', '')

		if (!ctx.state.isPlatformOwner) {
			await ctx.answerCbQuery(botText(this.getLanguage(ctx)).approveOnlyPlatformOwner)
			return
		}
		const t = botText(this.getLanguage(ctx))

		try {
			const { changed, business } = await this.registrationsService.approveBusiness(businessId)
			if (!changed) {
				await ctx.answerCbQuery(t.alreadyApproved)
				return
			}

			const ownerMsg = formatBotText(t.ownerApproved, { businessName: business.name })
			await this.notifyRegistrant(ctx, business.ownerUserId, ownerMsg)

			await ctx.editMessageText(`✅ ${formatBotText(t.approvedLine, { businessName: business.name })}`, { reply_markup: undefined })
			await ctx.answerCbQuery(t.businessApprovedCb)

			this.logger.log(`Business ${businessId} approved by Platform Owner`)
		} catch (err) {
			if (err instanceof NotFoundException) {
				await ctx.answerCbQuery(t.businessNotFound)
				return
			}
			if (err instanceof ConflictException) {
				await ctx.answerCbQuery(t.cannotApprove)
				return
			}
			this.logger.error(`Error approving business ${businessId}: ${describeError(err)}`)
			await ctx.answerCbQuery(t.failedApprove)
		}
	}

	private async handleRejectBusiness(@Ctx() ctx: IdentifiedContext, data: string): Promise<void> {
		const businessId = data.replace('reject_biz_', '')

		if (!ctx.state.isPlatformOwner) {
			await ctx.answerCbQuery(botText(this.getLanguage(ctx)).rejectOnlyPlatformOwner)
			return
		}
		const t = botText(this.getLanguage(ctx))

		try {
			const { changed, business } = await this.registrationsService.rejectBusiness(businessId)
			if (!changed) {
				await ctx.answerCbQuery(t.alreadyRejected)
				return
			}

			const rejectionMsg = formatBotText(t.ownerRejected, { businessName: business.name })
			await this.notifyRegistrant(ctx, business.ownerUserId, rejectionMsg)

			await ctx.editMessageText(`❌ ${formatBotText(t.rejectedLine, { businessName: business.name })}`, { reply_markup: undefined })
			await ctx.answerCbQuery(t.businessRejectedCb)

			this.logger.log(`Business ${businessId} rejected by Platform Owner`)
		} catch (err) {
			if (err instanceof NotFoundException) {
				await ctx.answerCbQuery(t.businessNotFound)
				return
			}
			if (err instanceof ConflictException) {
				await ctx.answerCbQuery(t.cannotReject)
				return
			}
			this.logger.error(`Error rejecting business ${businessId}: ${describeError(err)}`)
			await ctx.answerCbQuery(t.failedReject)
		}
	}

	private async notifyRegistrant(ctx: IdentifiedContext, ownerUserId: string | null, message: string): Promise<void> {
		if (!ownerUserId) {
			return
		}

		const owner = await this.usersService.findById(ownerUserId)
		if (!owner) {
			return
		}

		try {
			await ctx.telegram.sendMessage(owner.telegramUserId, message)
		} catch (err) {
			this.logger.error(`Failed to notify registrant ${owner.id}: ${describeError(err)}`)
		}
	}

	private getLanguage(ctx: IdentifiedContext): SupportedLanguage {
		const sessionLanguage = ctx.session?.language
		if (isSupportedLanguage(sessionLanguage)) {
			return sessionLanguage
		}
		return ctx.state.user?.language || 'en'
	}
}
