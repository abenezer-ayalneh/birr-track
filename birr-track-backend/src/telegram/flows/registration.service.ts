import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Action, Ctx, Update } from 'nestjs-telegraf'

import { RegistrationsService } from '../../registrations/registrations.service'
import { describeError } from '../../shared/utils/describe-error.util'
import { IdentifiedContext } from '../services/identity.service'
import { botText } from '../telegram.i18n'
import { renderBotHtml, withTelegramHtml } from '../telegram-html'

@Injectable()
@Update()
export class RegistrationService {
	private readonly logger = new Logger(RegistrationService.name)

	constructor(private readonly registrationsService: RegistrationsService) {}

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
		const t = botText('en')

		if (!ctx.state.isPlatformOwner) {
			await ctx.answerCbQuery(t.approveOnlyPlatformOwner)
			return
		}

		try {
			const { changed, business } = await this.registrationsService.approveBusiness(businessId)
			await this.editDecisionMessage(ctx, t.approvedLine, business.name)
			await ctx.answerCbQuery(changed ? t.businessApprovedCb : t.alreadyApproved)

			if (changed) this.logger.log(`Business ${businessId} approved by Platform Owner`)
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
		const t = botText('en')

		if (!ctx.state.isPlatformOwner) {
			await ctx.answerCbQuery(t.rejectOnlyPlatformOwner)
			return
		}

		try {
			const { changed, business } = await this.registrationsService.rejectBusiness(businessId)
			await this.editDecisionMessage(ctx, t.rejectedLine, business.name)
			await ctx.answerCbQuery(changed ? t.businessRejectedCb : t.alreadyRejected)

			if (changed) this.logger.log(`Business ${businessId} rejected by Platform Owner`)
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

	private async editDecisionMessage(ctx: IdentifiedContext, template: string, businessName: string): Promise<void> {
		try {
			await ctx.editMessageText(renderBotHtml(template, { businessName }), withTelegramHtml({ reply_markup: undefined }))
		} catch (err) {
			this.logger.error(`Failed to update Registration moderation alert: ${describeError(err)}`)
		}
	}
}
