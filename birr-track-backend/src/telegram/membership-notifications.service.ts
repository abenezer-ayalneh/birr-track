import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'

import { BusinessesService } from '../businesses/businesses.service'
import { MembershipDepartureEvent, MembershipEventsService } from '../users/membership-events.service'
import { UsersService } from '../users/users.service'
import { TELEGRAM_BOT_NAME } from './telegram.constants'
import { botText, formatBotText } from './telegram.i18n'

@Injectable()
export class MembershipNotificationsService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(MembershipNotificationsService.name)
	private unsubscribe: (() => void) | null = null

	constructor(
		@InjectBot(TELEGRAM_BOT_NAME) private readonly telegramBot: Telegraf,
		private readonly membershipEvents: MembershipEventsService,
		private readonly usersService: UsersService,
		private readonly businessesService: BusinessesService,
	) {}

	onModuleInit(): void {
		this.unsubscribe = this.membershipEvents.subscribe((event) => this.notify(event))
	}

	onModuleDestroy(): void {
		this.unsubscribe?.()
	}

	private async notify(event: MembershipDepartureEvent): Promise<void> {
		const business = await this.businessesService.findById(event.businessId)
		if (!business) {
			this.logger.warn(`Cannot notify membership change: business ${event.businessId} not found`)
			return
		}

		if (event.kind === 'removed') {
			await this.send(event.member.telegramUserId, event.member.language, 'removedFromBusiness', {
				businessName: business.name,
				actorName: event.actor?.displayName ?? 'Business management',
				reason: this.formatReason(event.member.language, event.reason),
			})

			if (event.actor?.role === 'manager' && event.member.role === 'waiter') {
				const owner = (await this.usersService.getBusinessStaff(event.businessId)).find((member) => member.role === 'owner')
				if (owner) {
					await this.send(owner.telegramUserId, owner.language, 'waiterRemovedByManager', {
						memberName: event.member.displayName,
						businessName: business.name,
						actorName: event.actor.displayName,
						reason: this.formatReason(owner.language, event.reason),
					})
				}
			}
			return
		}

		const leaders = (await this.usersService.getBusinessStaff(event.businessId)).filter(
			(member) => (member.role === 'owner' || member.role === 'manager') && member.id !== event.member.id,
		)
		await Promise.all(
			leaders.map((leader) =>
				this.send(leader.telegramUserId, leader.language, 'memberLeftBusiness', {
					displayName: event.member.displayName,
					businessName: business.name,
				}),
			),
		)
	}

	private async send(
		telegramUserId: string,
		language: 'en' | 'am',
		key: 'removedFromBusiness' | 'memberLeftBusiness' | 'waiterRemovedByManager',
		values: Record<string, string>,
	): Promise<void> {
		try {
			await this.telegramBot.telegram.sendMessage(telegramUserId, formatBotText(botText(language)[key], values))
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'unknown error'
			this.logger.warn(`Failed to send membership notification to ${telegramUserId}: ${message}`)
		}
	}

	private formatReason(language: 'en' | 'am', reason: string | undefined): string {
		if (!reason) return ''
		return language === 'am' ? `ምክንያት: ${reason}` : `Reason: ${reason}`
	}
}
