import { UsersService } from '../../users/users.service'
import { createIdentityMiddleware, IdentifiedContext, IdentityService } from './identity.service'

describe('createIdentityMiddleware', () => {
	function buildUsersService() {
		return {
			isPlatformOwner: jest.fn().mockReturnValue(false),
			findByTelegramId: jest.fn().mockResolvedValue(null),
			isActiveMemberOf: jest.fn().mockReturnValue(false),
		} as unknown as jest.Mocked<Pick<UsersService, 'isPlatformOwner' | 'findByTelegramId' | 'isActiveMemberOf'>>
	}

	it('populates Platform Owner state before the next handler runs', async () => {
		const usersService = buildUsersService()
		usersService.isPlatformOwner.mockReturnValue(true)

		const ctx = {
			from: { id: 4242 },
			state: {},
		} as IdentifiedContext
		const next = jest.fn().mockResolvedValue(undefined)

		await createIdentityMiddleware(usersService as unknown as UsersService)(ctx, next)

		expect(usersService.isPlatformOwner).toHaveBeenCalledWith('4242')
		expect(usersService.findByTelegramId).toHaveBeenCalledWith('4242')
		expect(ctx.state).toEqual({
			user: null,
			business: null,
			isPlatformOwner: true,
			isActiveMember: false,
		})
		expect(next).toHaveBeenCalledTimes(1)
	})

	it('keeps the injectable service behavior aligned with the registered middleware', async () => {
		const usersService = buildUsersService()
		const service = new IdentityService(usersService as unknown as UsersService)
		const ctx = {
			from: { id: 5151 },
			state: {},
		} as IdentifiedContext

		await service.resolveIdentity(ctx)

		expect(usersService.isPlatformOwner).toHaveBeenCalledWith('5151')
		expect(ctx.state.isPlatformOwner).toBe(false)
		expect(ctx.state.user).toBeNull()
	})
})
