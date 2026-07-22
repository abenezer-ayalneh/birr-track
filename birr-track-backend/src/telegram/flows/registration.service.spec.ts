import { RegistrationsService } from '../../registrations/registrations.service'
import { IdentifiedContext } from '../services/identity.service'
import { botText } from '../telegram.i18n'
import { RegistrationService } from './registration.service'

describe('RegistrationService', () => {
	const english = botText('en')

	function buildService() {
		const registrationsService = {
			approveBusiness: jest.fn(),
			rejectBusiness: jest.fn(),
		} as unknown as jest.Mocked<Pick<RegistrationsService, 'approveBusiness' | 'rejectBusiness'>>
		return {
			registrationsService,
			service: new RegistrationService(registrationsService as unknown as RegistrationsService),
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
		const { service, registrationsService } = buildService()
		const ctx = buildCallbackContext('approve_biz_business-1')
		registrationsService.approveBusiness.mockResolvedValue({
			status: 'active',
			message: 'Business approved successfully',
			changed: true,
			business: { id: 'business-1', name: 'Cafe Addis', ownerUserId: 'owner-1' } as never,
		})
		await service.handleCallbackQuery(ctx)

		expect(registrationsService.approveBusiness).toHaveBeenCalledWith('business-1')
		expect(ctx.telegram.sendMessage).not.toHaveBeenCalled()
		expect(ctx.editMessageText).toHaveBeenCalledWith(
			expect.stringContaining('Cafe Addis'),
			expect.objectContaining({ parse_mode: 'HTML', reply_markup: undefined }),
		)
		expect(ctx.answerCbQuery).toHaveBeenCalledWith(english.businessApprovedCb)
	})

	it('does not approve when the callback user is not the Platform Owner', async () => {
		const { service, registrationsService } = buildService()
		const ctx = buildCallbackContext('approve_biz_business-1', false)

		await service.handleCallbackQuery(ctx)

		expect(registrationsService.approveBusiness).not.toHaveBeenCalled()
		expect(ctx.answerCbQuery).toHaveBeenCalledWith(english.approveOnlyPlatformOwner)
	})

	it('edits a rejected alert while leaving the Prospective Owner notification to the domain service', async () => {
		const { service, registrationsService } = buildService()
		const ctx = buildCallbackContext('reject_biz_business-1')
		registrationsService.rejectBusiness.mockResolvedValue({
			status: 'rejected',
			message: 'Business rejected successfully',
			changed: true,
			business: {
				id: 'business-1',
				name: 'Cafe Addis',
				ownerUserId: 'owner-1',
				rejectionReason: 'Please use the registered trading name.',
			} as never,
		})
		await service.handleCallbackQuery(ctx)

		expect(registrationsService.rejectBusiness).toHaveBeenCalledWith('business-1')
		expect(ctx.telegram.sendMessage).not.toHaveBeenCalled()
		expect(ctx.editMessageText).toHaveBeenCalledWith(
			expect.stringContaining('Cafe Addis'),
			expect.objectContaining({ parse_mode: 'HTML', reply_markup: undefined }),
		)
		expect(ctx.answerCbQuery).toHaveBeenCalledWith(english.businessRejectedCb)
	})

	it('removes stale moderation buttons after an idempotent Mini App decision without sending another DM', async () => {
		const { service, registrationsService } = buildService()
		const ctx = buildCallbackContext('approve_biz_business-1')
		registrationsService.approveBusiness.mockResolvedValue({
			status: 'active',
			message: 'Business is already active',
			changed: false,
			business: { id: 'business-1', name: 'Cafe <Addis> & Co', ownerUserId: 'owner-1' } as never,
		})

		await service.handleCallbackQuery(ctx)

		expect(ctx.telegram.sendMessage).not.toHaveBeenCalled()
		expect(ctx.editMessageText).toHaveBeenCalledWith(
			expect.stringContaining('Cafe &lt;Addis&gt; &amp; Co'),
			expect.objectContaining({ parse_mode: 'HTML', reply_markup: undefined }),
		)
		expect(ctx.answerCbQuery).toHaveBeenCalledWith(english.alreadyApproved)
	})
})
