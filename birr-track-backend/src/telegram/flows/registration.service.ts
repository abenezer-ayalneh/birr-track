import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Ctx, On, Update } from 'nestjs-telegraf'

import { RegistrationsService } from '../../registrations/registrations.service'
import { describeError } from '../../shared/utils/describe-error.util'
import { UsersService } from '../../users/users.service'
import { IdentifiedContext } from '../services/identity.service'

@Injectable()
@Update()
export class RegistrationService {
	private readonly logger = new Logger(RegistrationService.name)

	constructor(
		private readonly registrationsService: RegistrationsService,
		private readonly usersService: UsersService,
	) {}

	@On('callback_query')
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
			await ctx.answerCbQuery('Only the Platform Owner can approve registrations.')
			return
		}

		try {
			const { changed, business } = await this.registrationsService.approveBusiness(businessId)
			if (!changed) {
				await ctx.answerCbQuery('Already approved.')
				return
			}

			const ownerMsg = `🎉 Your business "${business.name}" has been approved! You can now start accepting receipts from your team.`
			await this.notifyRegistrant(ctx, business.ownerUserId, ownerMsg)

			await ctx.editMessageText(`✅ Approved: ${business.name}`, { reply_markup: undefined })
			await ctx.answerCbQuery('Business approved!')

			this.logger.log(`Business ${businessId} approved by Platform Owner`)
		} catch (err) {
			if (err instanceof NotFoundException) {
				await ctx.answerCbQuery('Business not found.')
				return
			}
			if (err instanceof ConflictException) {
				await ctx.answerCbQuery('Cannot approve this business.')
				return
			}
			this.logger.error(`Error approving business ${businessId}: ${describeError(err)}`)
			await ctx.answerCbQuery('Failed to approve.')
		}
	}

	private async handleRejectBusiness(@Ctx() ctx: IdentifiedContext, data: string): Promise<void> {
		const businessId = data.replace('reject_biz_', '')

		if (!ctx.state.isPlatformOwner) {
			await ctx.answerCbQuery('Only the Platform Owner can reject registrations.')
			return
		}

		try {
			const { changed, business } = await this.registrationsService.rejectBusiness(businessId)
			if (!changed) {
				await ctx.answerCbQuery('Already rejected.')
				return
			}

			const rejectionMsg = `Your business registration for "${business.name}" was not approved at this time. Please contact support for details.`
			await this.notifyRegistrant(ctx, business.ownerUserId, rejectionMsg)

			await ctx.editMessageText(`❌ Rejected: ${business.name}`, { reply_markup: undefined })
			await ctx.answerCbQuery('Business rejected.')

			this.logger.log(`Business ${businessId} rejected by Platform Owner`)
		} catch (err) {
			if (err instanceof NotFoundException) {
				await ctx.answerCbQuery('Business not found.')
				return
			}
			if (err instanceof ConflictException) {
				await ctx.answerCbQuery('Cannot reject this business.')
				return
			}
			this.logger.error(`Error rejecting business ${businessId}: ${describeError(err)}`)
			await ctx.answerCbQuery('Failed to reject.')
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
}
