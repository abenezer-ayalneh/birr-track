/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */
import { ConflictException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { User } from '../users/entities/user.entity'
import { UsersService } from '../users/users.service'
import { Invite } from './entities/invite.entity'
import { InvitesService } from './invites.service'

describe('InvitesService', () => {
	let service: InvitesService
	let inviteRepository: Repository<Invite>
	let usersService: UsersService
	let configService: ConfigService

	const mockInvite: Invite = {
		id: 'invite-1',
		inviteeTelegramId: '999999999',
		businessId: 'business-1',
		role: 'waiter',
		createdByUserId: 'user-1',
		status: 'pending',
		expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
		createdAt: new Date(),
		business: null as any,
		createdBy: null as any,
	}

	const mockUser: User = {
		id: 'user-1',
		telegramUserId: '123456789',
		displayName: 'John Waiter',
		businessId: 'business-1',
		role: 'waiter' as const,
		language: 'en',
		removedAt: null,
		createdAt: new Date(),
		business: null,
	}

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				InvitesService,
				{
					provide: getRepositoryToken(Invite),
					useValue: {
						findOne: jest.fn(),
						create: jest.fn(),
						save: jest.fn(),
						update: jest.fn(),
					},
				},
				{
					provide: UsersService,
					useValue: {
						findByTelegramId: jest.fn(),
						joinBusiness: jest.fn(),
					},
				},
				{
					provide: ConfigService,
					useValue: {
						get: jest.fn(),
					},
				},
			],
		}).compile()

		service = module.get<InvitesService>(InvitesService)
		inviteRepository = module.get<Repository<Invite>>(getRepositoryToken(Invite))
		usersService = module.get<UsersService>(UsersService)
		configService = module.get<ConfigService>(ConfigService)
	})

	describe('create', () => {
		it('should create a pending invite', async () => {
			jest.spyOn(usersService, 'findByTelegramId').mockResolvedValue(null)
			jest.spyOn(inviteRepository, 'create').mockReturnValue(mockInvite)
			jest.spyOn(inviteRepository, 'save').mockResolvedValue(mockInvite)
			jest.spyOn(inviteRepository, 'update').mockResolvedValue({ affected: 0 } as any)
			jest.spyOn(configService, 'get').mockReturnValue(undefined)

			const result = await service.create({
				inviteeTelegramId: '999999999',
				businessId: 'business-1',
				role: 'waiter',
				createdByUserId: 'user-1',
			})

			expect(result.status).toBe('pending')
			expect(inviteRepository.save).toHaveBeenCalled()
		})

		it('should throw ConflictException if invitee already has active membership', async () => {
			jest.spyOn(usersService, 'findByTelegramId').mockResolvedValue(mockUser)

			await expect(
				service.create({
					inviteeTelegramId: '999999999',
					businessId: 'business-1',
					role: 'waiter',
					createdByUserId: 'user-1',
				}),
			).rejects.toThrow(ConflictException)
		})

		it('should revoke prior pending invite before creating new one', async () => {
			jest.spyOn(usersService, 'findByTelegramId').mockResolvedValue(null)
			jest.spyOn(inviteRepository, 'update').mockResolvedValue({ affected: 1 } as any)
			jest.spyOn(inviteRepository, 'create').mockReturnValue(mockInvite)
			jest.spyOn(inviteRepository, 'save').mockResolvedValue(mockInvite)
			jest.spyOn(configService, 'get').mockReturnValue(undefined)

			await service.create({
				inviteeTelegramId: '999999999',
				businessId: 'business-1',
				role: 'waiter',
				createdByUserId: 'user-1',
			})

			expect(inviteRepository.update).toHaveBeenCalledWith({ inviteeTelegramId: '999999999', status: 'pending' }, { status: 'revoked' })
		})

		it('should respect INVITE_TTL_DAYS config', async () => {
			jest.spyOn(usersService, 'findByTelegramId').mockResolvedValue(null)
			jest.spyOn(inviteRepository, 'update').mockResolvedValue({ affected: 0 } as any)
			jest.spyOn(inviteRepository, 'create').mockReturnValue(mockInvite)
			jest.spyOn(inviteRepository, 'save').mockResolvedValue(mockInvite)
			jest.spyOn(configService, 'get').mockReturnValue('14')

			await service.create({
				inviteeTelegramId: '999999999',
				businessId: 'business-1',
				role: 'waiter',
				createdByUserId: 'user-1',
			})

			const createdInvite = (inviteRepository.create as jest.Mock).mock.calls[0][0] as { expiresAt: Date }
			expect(createdInvite.expiresAt.getTime()).toBeGreaterThan(Date.now() + 13 * 24 * 60 * 60 * 1000)
		})
	})

	describe('redeem', () => {
		it('should redeem valid pending invite', async () => {
			const futureExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000)
			const inviteToRedeem = { ...mockInvite, expiresAt: futureExpiry }

			jest.spyOn(inviteRepository, 'findOne').mockResolvedValue(inviteToRedeem)
			jest.spyOn(usersService, 'joinBusiness').mockResolvedValue(mockUser)
			jest.spyOn(inviteRepository, 'save').mockResolvedValue({ ...inviteToRedeem, status: 'redeemed' })

			const result = await service.redeem('999999999', 'New Member')

			expect(result).not.toBeNull()
			expect(result?.invite.status).toBe('redeemed')
			expect(result?.user).toEqual(mockUser)
		})

		it('should return null when no pending invite exists', async () => {
			jest.spyOn(inviteRepository, 'findOne').mockResolvedValue(null)

			const result = await service.redeem('999999999', 'New Member')

			expect(result).toBeNull()
		})

		it('should mark expired invite as expired and return null', async () => {
			const pastExpiry = new Date(Date.now() - 24 * 60 * 60 * 1000)
			const expiredInvite = { ...mockInvite, expiresAt: pastExpiry }

			jest.spyOn(inviteRepository, 'findOne').mockResolvedValue(expiredInvite)
			jest.spyOn(inviteRepository, 'save').mockResolvedValue({ ...expiredInvite, status: 'expired' })

			const result = await service.redeem('999999999', 'New Member')

			expect(result).toBeNull()
			expect(inviteRepository.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'expired' }))
		})

		it('should join the invitee to business with correct role', async () => {
			const futureExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000)
			const inviteToRedeem = { ...mockInvite, expiresAt: futureExpiry, role: 'manager' as const }

			jest.spyOn(inviteRepository, 'findOne').mockResolvedValue(inviteToRedeem)
			jest.spyOn(usersService, 'joinBusiness').mockResolvedValue({ ...mockUser, role: 'manager' })
			jest.spyOn(inviteRepository, 'save').mockResolvedValue({ ...inviteToRedeem, status: 'redeemed' })

			await service.redeem('999999999', 'New Member')

			expect(usersService.joinBusiness).toHaveBeenCalledWith({
				telegramUserId: '999999999',
				displayName: 'New Member',
				businessId: 'business-1',
				role: 'manager',
			})
		})
	})

	describe('revoke', () => {
		it('should revoke a pending invite', async () => {
			jest.spyOn(inviteRepository, 'findOne').mockResolvedValue(mockInvite)
			jest.spyOn(inviteRepository, 'save').mockResolvedValue({ ...mockInvite, status: 'revoked' })

			const result = await service.revoke('invite-1')

			expect(result.status).toBe('revoked')
			expect(inviteRepository.save).toHaveBeenCalled()
		})

		it('should throw NotFoundException if invite not found', async () => {
			jest.spyOn(inviteRepository, 'findOne').mockResolvedValue(null)

			await expect(service.revoke('nonexistent')).rejects.toThrow(NotFoundException)
		})

		it('should throw ConflictException if invite is already redeemed', async () => {
			jest.spyOn(inviteRepository, 'findOne').mockResolvedValue({ ...mockInvite, status: 'redeemed' })

			await expect(service.revoke('invite-1')).rejects.toThrow(ConflictException)
		})

		it('should throw ConflictException if invite is already revoked', async () => {
			jest.spyOn(inviteRepository, 'findOne').mockResolvedValue({ ...mockInvite, status: 'revoked' })

			await expect(service.revoke('invite-1')).rejects.toThrow(ConflictException)
		})
	})

	describe('expirePending', () => {
		it('should mark expired pending invites as expired', async () => {
			jest.spyOn(inviteRepository, 'update').mockResolvedValue({ affected: 3 } as any)

			const count = await service.expirePending()

			expect(count).toBe(3)
			expect(inviteRepository.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }), { status: 'expired' })
		})

		it('should return 0 when no invites expire', async () => {
			jest.spyOn(inviteRepository, 'update').mockResolvedValue({ affected: 0 } as any)

			const count = await service.expirePending()

			expect(count).toBe(0)
		})
	})
})
