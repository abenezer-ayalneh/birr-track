import { Telegraf } from 'telegraf'

import { BusinessesService } from '../businesses/businesses.service'
import { MembershipDepartureEvent, MembershipEventsService } from '../users/membership-events.service'
import { UsersService } from '../users/users.service'
import { MembershipNotificationsService } from './membership-notifications.service'
import { botText } from './telegram.i18n'
import { renderBotHtml } from './telegram-html'

describe('MembershipNotificationsService', () => {
	function buildService() {
		const sendMessage = jest.fn().mockResolvedValue(undefined)
		const telegramBot = { telegram: { sendMessage } } as unknown as Telegraf
		let listener: ((event: MembershipDepartureEvent) => void | Promise<void>) | undefined
		const unsubscribe = jest.fn()
		const membershipEvents = {
			subscribe: jest.fn((candidate: (event: MembershipDepartureEvent) => void | Promise<void>) => {
				listener = candidate
				return unsubscribe
			}),
		} as unknown as MembershipEventsService
		const usersService = {
			getBusinessStaff: jest.fn(),
		} as unknown as jest.Mocked<Pick<UsersService, 'getBusinessStaff'>>
		const businessesService = {
			findById: jest.fn(),
		} as unknown as jest.Mocked<Pick<BusinessesService, 'findById'>>

		const service = new MembershipNotificationsService(
			telegramBot,
			membershipEvents,
			usersService as unknown as UsersService,
			businessesService as unknown as BusinessesService,
		)
		service.onModuleInit()

		return {
			businessesService,
			dispatch: async (event: MembershipDepartureEvent) => {
				if (!listener) throw new Error('Membership listener was not registered')
				await listener(event)
			},
			sendMessage,
			service,
			unsubscribe,
			usersService,
		}
	}

	it('notifies a removed member in that member’s Language Preference with escaped HTML values', async () => {
		const { businessesService, dispatch, sendMessage } = buildService()
		businessesService.findById.mockResolvedValue({ name: 'Cafe <Addis> & Co' } as never)

		await dispatch({
			kind: 'removed',
			businessId: 'business-1',
			member: {
				id: 'member-1',
				telegramUserId: 'member-chat',
				displayName: 'Removed Member',
				role: 'manager',
				language: 'am',
				businessId: null,
			},
			actor: {
				id: 'owner-1',
				displayName: `Owner "One" & <Lead>`,
				role: 'owner',
				language: 'en',
			},
			reason: `Policy's <limit> & review`,
		})

		const sentText = renderBotHtml(botText('am').removedFromBusiness, {
			businessName: 'Cafe <Addis> & Co',
			actorName: `Owner "One" & <Lead>`,
			reason: `${botText('am').reasonPrefix}Policy's <limit> & review`,
		})
		expect(sendMessage).toHaveBeenCalledWith('member-chat', sentText, { parse_mode: 'HTML' })
		expect(sentText).toContain('Cafe &lt;Addis&gt; &amp; Co')
		expect(sentText).not.toContain('<Lead>')
		expect(sentText).not.toContain('<limit>')
	})

	it('uses localized fallbacks when a removal has no actor or reason', async () => {
		const { businessesService, dispatch, sendMessage } = buildService()
		businessesService.findById.mockResolvedValue({ name: 'Blue Nile' } as never)

		await dispatch({
			kind: 'removed',
			businessId: 'business-1',
			member: {
				id: 'member-1',
				telegramUserId: 'member-chat',
				displayName: 'Removed Member',
				role: 'manager',
				language: 'en',
				businessId: null,
			},
		})

		expect(sendMessage).toHaveBeenCalledWith(
			'member-chat',
			renderBotHtml(botText('en').removedFromBusiness, {
				businessName: 'Blue Nile',
				actorName: botText('en').businessManagement,
				reason: botText('en').reasonNotProvided,
			}),
			{ parse_mode: 'HTML' },
		)
	})

	it('uses the removed Waiter and Owner Language Preferences for a Manager removal', async () => {
		const { businessesService, dispatch, sendMessage, usersService } = buildService()
		businessesService.findById.mockResolvedValue({ name: 'Blue Nile' } as never)
		usersService.getBusinessStaff.mockResolvedValue([
			{
				id: 'owner-1',
				telegramUserId: 'owner-chat',
				displayName: 'Owner',
				role: 'owner',
				language: 'en',
			} as never,
		])

		await dispatch({
			kind: 'removed',
			businessId: 'business-1',
			member: {
				id: 'waiter-1',
				telegramUserId: 'waiter-chat',
				displayName: 'Sam <Waiter>',
				role: 'waiter',
				language: 'am',
				businessId: null,
			},
			actor: {
				id: 'manager-1',
				displayName: 'Mimi & Team',
				role: 'manager',
				language: 'am',
			},
			reason: 'Shift <ended>',
		})

		expect(sendMessage).toHaveBeenNthCalledWith(
			1,
			'waiter-chat',
			renderBotHtml(botText('am').removedFromBusiness, {
				businessName: 'Blue Nile',
				actorName: 'Mimi & Team',
				reason: `${botText('am').reasonPrefix}Shift <ended>`,
			}),
			{ parse_mode: 'HTML' },
		)
		const ownerMessage = renderBotHtml(botText('en').waiterRemovedByManager, {
			memberName: 'Sam <Waiter>',
			businessName: 'Blue Nile',
			actorName: 'Mimi & Team',
			reason: `${botText('en').reasonPrefix}Shift <ended>`,
		})
		expect(sendMessage).toHaveBeenNthCalledWith(2, 'owner-chat', ownerMessage, { parse_mode: 'HTML' })
		expect(ownerMessage).toContain('Sam &lt;Waiter&gt;')
	})

	it('notifies each leader who remains in the Business using that leader’s Language Preference', async () => {
		const { businessesService, dispatch, sendMessage, usersService } = buildService()
		businessesService.findById.mockResolvedValue({ name: 'Cafe <Addis> & Co' } as never)
		usersService.getBusinessStaff.mockResolvedValue([
			{
				id: 'owner-1',
				telegramUserId: 'owner-chat',
				displayName: 'Owner',
				role: 'owner',
				language: 'en',
			} as never,
			{
				id: 'manager-1',
				telegramUserId: 'manager-chat',
				displayName: 'Manager',
				role: 'manager',
				language: 'am',
			} as never,
			{
				id: 'member-1',
				telegramUserId: 'departed-chat',
				displayName: 'Departed',
				role: 'manager',
				language: 'en',
			} as never,
		])

		await dispatch({
			kind: 'left',
			businessId: 'business-1',
			member: {
				id: 'member-1',
				telegramUserId: 'departed-chat',
				displayName: `A&B's <Manager>`,
				role: 'manager',
				language: 'en',
				businessId: null,
			},
		})

		const englishMessage = renderBotHtml(botText('en').memberLeftBusiness, {
			displayName: `A&B's <Manager>`,
			businessName: 'Cafe <Addis> & Co',
		})
		const amharicMessage = renderBotHtml(botText('am').memberLeftBusiness, {
			displayName: `A&B's <Manager>`,
			businessName: 'Cafe <Addis> & Co',
		})
		expect(sendMessage).toHaveBeenNthCalledWith(1, 'owner-chat', englishMessage, { parse_mode: 'HTML' })
		expect(sendMessage).toHaveBeenNthCalledWith(2, 'manager-chat', amharicMessage, { parse_mode: 'HTML' })
		expect(sendMessage).toHaveBeenCalledTimes(2)
		for (const text of [englishMessage, amharicMessage]) {
			expect(text).toContain('A&amp;B&#39;s &lt;Manager&gt;')
			expect(text).toContain('Cafe &lt;Addis&gt; &amp; Co')
		}
	})
})
