import { Injectable, Logger } from '@nestjs/common'
import { Ctx, On, Update } from 'nestjs-telegraf'

import { BusinessesService } from '../../businesses/businesses.service'
import { describeError } from '../../shared/utils/describe-error.util'
import { UsersService } from '../../users/users.service'
import { IdentifiedContext } from '../services/identity.service'

@Injectable()
@Update()
export class RegistrationService {
	private readonly logger = new Logger(RegistrationService.name)

	constructor(
		private readonly businessesService: BusinessesService,
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
			const business = await this.businessesService.findById(businessId)
			if (!business) {
				await ctx.answerCbQuery('Business not found.')
				return
			}

			if (business.status === 'active') {
				await ctx.answerCbQuery('Already approved.')
				return
			}

			business.status = 'active'
			await this.businessesService.save(business)

			if (business.ownerUserId) {
				const owner = await this.usersService.findById(business.ownerUserId)
				if (owner) {
					const ownerMsg = `🎉 Your business "${business.name}" has been approved! You can now start accepting receipts from your team.`
					try {
						await ctx.telegram.sendMessage(owner.telegramUserId, ownerMsg)
					} catch (err) {
						this.logger.error(`Failed to notify owner ${owner.id}: ${describeError(err)}`)
					}
				}
			}

			await ctx.editMessageText(`✅ Approved: ${business.name}`, { reply_markup: undefined })
			await ctx.answerCbQuery('Business approved!')

			this.logger.log(`Business ${businessId} approved by Platform Owner`)
		} catch (err) {
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
			const business = await this.businessesService.findById(businessId)
			if (!business) {
				await ctx.answerCbQuery('Business not found.')
				return
			}

			if (business.status === 'rejected') {
				await ctx.answerCbQuery('Already rejected.')
				return
			}

			if (business.status === 'active') {
				await ctx.answerCbQuery('Cannot reject an active business.')
				return
			}

			business.status = 'rejected'
			await this.businessesService.save(business)

			if (business.ownerUserId) {
				const owner = await this.usersService.findById(business.ownerUserId)
				if (owner) {
					const rejectionMsg = `Your business registration for "${business.name}" was not approved at this time. Please contact support for details.`
					try {
						await ctx.telegram.sendMessage(owner.telegramUserId, rejectionMsg)
					} catch (err) {
						this.logger.error(`Failed to notify rejected owner ${owner.id}: ${describeError(err)}`)
					}
				}
			}

			await ctx.editMessageText(`❌ Rejected: ${business.name}`, { reply_markup: undefined })
			await ctx.answerCbQuery('Business rejected.')

			this.logger.log(`Business ${businessId} rejected by Platform Owner`)
		} catch (err) {
			this.logger.error(`Error rejecting business ${businessId}: ${describeError(err)}`)
			await ctx.answerCbQuery('Failed to reject.')
		}
	}
}
