/* eslint-disable @typescript-eslint/unbound-method */
import { RegistrationsService } from '../../registrations/registrations.service'
import { UsersService } from '../../users/users.service'
import { IdentifiedContext } from '../services/identity.service'
import { RegistrationService } from './registration.service'

describe('RegistrationService', () => {
	function buildService() {
		const registrationsService = {
			approveBusiness: jest.fn(),
			rejectBusiness: jest.fn(),
		} as unknown as jest.Mocked<Pick<RegistrationsService, 'approveBusiness' | 'rejectBusiness'>>
		const usersService = {
			findById: jest.fn(),
		} as unknown as jest.Mocked<Pick<UsersService, 'findById'>>

		return {
			registrationsService,
			usersService,
			service: new RegistrationService(registrationsService as unknown as RegistrationsService, usersService as unknown as UsersService),
		}
	}

	function buildCallbackContext(data: string, isPlatformOwner = true) {
		return {
			callbackQuery: { data },
			state: { user: null, business: null, isPlatformOwner, isActiveMember: false },
			answerCbQuery: jest.fn().mockResolvedValue(undefined),
			editMessageText: jest.fn().mockResolvedValue(undefined),
			telegram: { sendMessage: jest.fn().mockResolvedValue(undefined) },
		} as unknown as IdentifiedContext & {
			answerCbQuery: jest.Mock
			editMessageText: jest.Mock
			telegram: { sendMessage: jest.Mock }
		}
	}

	it('approves a business from an approve callback', async () => {
		const { service, registrationsService, usersService } = buildService()
		const ctx = buildCallbackContext('approve_biz_business-1')
		registrationsService.approveBusiness.mockResolvedValue({
			status: 'active',
			message: 'Business approved successfully',
			changed: true,
			business: { id: 'business-1', name: 'Cafe Addis', ownerUserId: 'owner-1' } as never,
		})
		usersService.findById.mockResolvedValue({ id: 'owner-1', telegramUserId: '111' } as never)

		await service.handleCallbackQuery(ctx)

		expect(registrationsService.approveBusiness).toHaveBeenCalledWith('business-1')
		expect(ctx.telegram.sendMessage).toHaveBeenCalledWith('111', expect.stringContaining('Cafe Addis'))
		expect(ctx.editMessageText).toHaveBeenCalledWith('✅ Approved: Cafe Addis', { reply_markup: undefined })
		expect(ctx.answerCbQuery).toHaveBeenCalledWith('Business approved!')
	})

	it('does not approve when the callback user is not the Platform Owner', async () => {
		const { service, registrationsService } = buildService()
		const ctx = buildCallbackContext('approve_biz_business-1', false)

		await service.handleCallbackQuery(ctx)

		expect(registrationsService.approveBusiness).not.toHaveBeenCalled()
		expect(ctx.answerCbQuery).toHaveBeenCalledWith('Only the Platform Owner can approve registrations.')
	})
})
