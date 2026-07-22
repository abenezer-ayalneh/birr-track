import { ConflictException } from '@nestjs/common'

import { JwtPayload } from '../auth/auth.service'
import { RegistrationsController } from './registrations.controller'
import { RegistrationsService } from './registrations.service'

describe('RegistrationsController', () => {
	const platformOwner = {
		userId: null,
		businessId: null,
		role: 'platform_owner',
		telegramUserId: '999',
		iat: 1,
		exp: 2,
	} as JwtPayload

	function buildController() {
		const registrationsService = {
			getPendingRegistrations: jest.fn(),
			approveBusiness: jest.fn(),
			rejectBusiness: jest.fn(),
		} as unknown as jest.Mocked<Pick<RegistrationsService, 'getPendingRegistrations' | 'approveBusiness' | 'rejectBusiness'>>
		return {
			controller: new RegistrationsController(registrationsService as unknown as RegistrationsService),
			registrationsService,
		}
	}

	it('routes repeated Mini App approvals through the idempotent domain decision path', async () => {
		const { controller, registrationsService } = buildController()
		registrationsService.approveBusiness
			.mockResolvedValueOnce({ status: 'active', message: 'Business approved successfully', changed: true, business: {} as never })
			.mockResolvedValueOnce({ status: 'active', message: 'Business is already active', changed: false, business: {} as never })

		await expect(controller.approveBusiness('11111111-1111-4111-8111-111111111111', platformOwner)).resolves.toEqual({
			status: 'active',
			message: 'Business approved successfully',
		})
		await expect(controller.approveBusiness('11111111-1111-4111-8111-111111111111', platformOwner)).resolves.toEqual({
			status: 'active',
			message: 'Business is already active',
		})
		expect(registrationsService.approveBusiness).toHaveBeenCalledTimes(2)
	})

	it('routes repeated Mini App rejections and their reason through the idempotent domain decision path', async () => {
		const { controller, registrationsService } = buildController()
		registrationsService.rejectBusiness
			.mockResolvedValueOnce({ status: 'rejected', message: 'Business rejected successfully', changed: true, business: {} as never })
			.mockResolvedValueOnce({ status: 'rejected', message: 'Business is already rejected', changed: false, business: {} as never })

		await controller.rejectBusiness('11111111-1111-4111-8111-111111111111', { reason: 'Use the registered trading name.' }, platformOwner)
		await controller.rejectBusiness('11111111-1111-4111-8111-111111111111', { reason: 'Use the registered trading name.' }, platformOwner)

		expect(registrationsService.rejectBusiness).toHaveBeenNthCalledWith(1, '11111111-1111-4111-8111-111111111111', 'Use the registered trading name.')
		expect(registrationsService.rejectBusiness).toHaveBeenNthCalledWith(2, '11111111-1111-4111-8111-111111111111', 'Use the registered trading name.')
	})

	it('refuses a non-Platform Owner before invoking a decision', async () => {
		const { controller, registrationsService } = buildController()
		const owner = { ...platformOwner, role: 'owner' } as JwtPayload

		await expect(controller.approveBusiness('11111111-1111-4111-8111-111111111111', owner)).rejects.toThrow(ConflictException)
		expect(registrationsService.approveBusiness).not.toHaveBeenCalled()
	})
})
