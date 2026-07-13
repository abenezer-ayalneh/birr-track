/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource, IsNull, Repository } from 'typeorm'

import { AdminPanelSessionService } from '../auth/admin-panel-session.service'
import { User } from './entities/user.entity'
import { MembershipEventsService } from './membership-events.service'
import { UsersService } from './users.service'

describe('UsersService', () => {
	let service: UsersService
	let userRepository: Repository<User>
	let configService: ConfigService
	let inviteRepository: { update: jest.Mock }
	let adminPanelSessions: AdminPanelSessionService
	let membershipEvents: MembershipEventsService

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

	const mockManager: User = {
		id: 'manager-1',
		telegramUserId: '987654321',
		displayName: 'Jane Manager',
		businessId: 'business-1',
		role: 'manager' as const,
		language: 'en',
		removedAt: null,
		createdAt: new Date(),
		business: null,
	}

	const mockOwner: User = {
		id: 'owner-1',
		telegramUserId: '111111111',
		displayName: 'Alice Owner',
		businessId: 'business-1',
		role: 'owner' as const,
		language: 'en',
		removedAt: null,
		createdAt: new Date(),
		business: null,
	}

	beforeEach(async () => {
		const userRepositoryMock = {
			findOne: jest.fn(),
			create: jest.fn(),
			save: jest.fn(),
			find: jest.fn(),
		}
		const inviteRepositoryMock = { update: jest.fn() }
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				UsersService,
				{
					provide: getRepositoryToken(User),
					useValue: userRepositoryMock,
				},
				{
					provide: DataSource,
					useValue: {
						transaction: jest.fn((callback: (manager: { getRepository: (entity: unknown) => unknown }) => unknown) =>
							callback({ getRepository: (entity: unknown) => (entity === User ? userRepositoryMock : inviteRepositoryMock) }),
						),
					},
				},
				{
					provide: AdminPanelSessionService,
					useValue: { revokeAllForUser: jest.fn() },
				},
				{
					provide: MembershipEventsService,
					useValue: { publish: jest.fn() },
				},
				{
					provide: ConfigService,
					useValue: {
						get: jest.fn(),
					},
				},
			],
		}).compile()

		service = module.get<UsersService>(UsersService)
		userRepository = module.get<Repository<User>>(getRepositoryToken(User))
		configService = module.get<ConfigService>(ConfigService)
		inviteRepository = inviteRepositoryMock
		adminPanelSessions = module.get<AdminPanelSessionService>(AdminPanelSessionService)
		membershipEvents = module.get<MembershipEventsService>(MembershipEventsService)
	})

	describe('isPlatformOwner', () => {
		it('should return true when telegramUserId matches PLATFORM_OWNER_TELEGRAM_ID', () => {
			jest.spyOn(configService, 'get').mockReturnValue('111111111')
			expect(service.isPlatformOwner('111111111')).toBe(true)
		})

		it('should return false when telegramUserId does not match', () => {
			jest.spyOn(configService, 'get').mockReturnValue('111111111')
			expect(service.isPlatformOwner('999999999')).toBe(false)
		})

		it('should return false when env var is not set', () => {
			jest.spyOn(configService, 'get').mockReturnValue(undefined)
			expect(service.isPlatformOwner('111111111')).toBe(false)
		})
	})

	describe('findByTelegramId', () => {
		it('should return active user by telegramUserId', async () => {
			jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser)
			const result = await service.findByTelegramId('123456789')
			expect(result).toEqual(mockUser)
			expect(userRepository.findOne).toHaveBeenCalledWith({
				where: { telegramUserId: '123456789', removedAt: expect.any(Object) },
				relations: { business: true },
			})
		})

		it('should return null when user not found', async () => {
			jest.spyOn(userRepository, 'findOne').mockResolvedValue(null)
			const result = await service.findByTelegramId('999999999')
			expect(result).toBeNull()
		})

		it('should exclude soft-deleted users', async () => {
			jest.spyOn(userRepository, 'findOne').mockResolvedValue(null)
			const result = await service.findByTelegramId('123456789')
			expect(result).toBeNull()
		})
	})

	describe('joinBusiness', () => {
		it('should create new user joining a business', async () => {
			jest.spyOn(userRepository, 'findOne').mockResolvedValue(null)
			jest.spyOn(userRepository, 'create').mockReturnValue(mockUser)
			jest.spyOn(userRepository, 'save').mockResolvedValue(mockUser)

			const result = await service.joinBusiness({
				telegramUserId: '123456789',
				displayName: 'John Waiter',
				businessId: 'business-1',
				role: 'waiter',
			})

			expect(result).toEqual(mockUser)
			expect(userRepository.save).toHaveBeenCalled()
		})

		it('should throw ConflictException if user already belongs to a business', async () => {
			jest.spyOn(userRepository, 'findOne').mockResolvedValueOnce(mockUser).mockResolvedValueOnce(null)

			await expect(
				service.joinBusiness({
					telegramUserId: '123456789',
					displayName: 'John Waiter',
					businessId: 'business-2',
					role: 'waiter',
				}),
			).rejects.toThrow(ConflictException)
		})

		it('should reactivate soft-deleted user', async () => {
			const removedUser = { ...mockUser, removedAt: new Date() }
			jest.spyOn(userRepository, 'findOne').mockResolvedValue(removedUser)
			jest.spyOn(userRepository, 'save').mockResolvedValue(mockUser)

			const result = await service.joinBusiness({
				telegramUserId: '123456789',
				displayName: 'John Waiter',
				businessId: 'business-1',
				role: 'waiter',
			})

			expect(result.removedAt).toBeNull()
			expect(userRepository.save).toHaveBeenCalledWith(expect.objectContaining({ removedAt: null }))
		})
	})

	describe('promoteToManager', () => {
		it('should promote waiter to manager when actor is owner', async () => {
			const userCopy = { ...mockUser }
			;(userRepository.findOne as jest.Mock).mockResolvedValue(userCopy)
			;(userRepository.save as jest.Mock).mockResolvedValue({ ...userCopy, role: 'manager' })

			const result = await service.promoteToManager(mockOwner, mockUser.id)

			expect(result.role).toBe('manager')
			expect(userRepository.save).toHaveBeenCalled()
		})

		it('should throw ForbiddenException if actor is not owner', async () => {
			jest.spyOn(userRepository, 'findOne').mockResolvedValueOnce(mockUser)

			await expect(service.promoteToManager(mockManager, mockUser.id)).rejects.toThrow(ForbiddenException)
		})

		it('should throw ConflictException if target is not a waiter', async () => {
			jest.spyOn(userRepository, 'findOne').mockResolvedValueOnce(mockManager)

			await expect(service.promoteToManager(mockOwner, mockManager.id)).rejects.toThrow(ConflictException)
		})
	})

	describe('demoteToWaiter', () => {
		it('should demote manager to waiter when actor is owner', async () => {
			const managerCopy = { ...mockManager }
			;(userRepository.findOne as jest.Mock).mockResolvedValue(managerCopy)
			;(userRepository.save as jest.Mock).mockResolvedValue({ ...managerCopy, role: 'waiter' })

			const result = await service.demoteToWaiter(mockOwner, mockManager.id)

			expect(result.role).toBe('waiter')
			expect(userRepository.save).toHaveBeenCalled()
		})

		it('should throw ForbiddenException when trying to demote owner', async () => {
			jest.spyOn(userRepository, 'findOne').mockResolvedValueOnce(mockOwner)

			await expect(service.demoteToWaiter(mockOwner, mockOwner.id)).rejects.toThrow(ForbiddenException)
		})

		it('should throw ForbiddenException if actor is not owner', async () => {
			jest.spyOn(userRepository, 'findOne').mockResolvedValueOnce(mockManager)

			await expect(service.demoteToWaiter(mockManager, mockManager.id)).rejects.toThrow(ForbiddenException)
		})

		it('should throw ConflictException if target is not a manager', async () => {
			const userCopy = { ...mockUser }
			;(userRepository.findOne as jest.Mock).mockResolvedValue(userCopy)

			await expect(service.demoteToWaiter(mockOwner, mockUser.id)).rejects.toThrow(ConflictException)
		})
	})

	describe('remove', () => {
		it('should soft-remove waiter by manager', async () => {
			const userCopy = { ...mockUser }
			;(userRepository.findOne as jest.Mock).mockResolvedValue(userCopy)
			;(userRepository.save as jest.Mock).mockResolvedValue({ ...userCopy, removedAt: new Date() })

			const result = await service.remove(mockManager, mockUser.id)

			expect(result.removedAt).not.toBeNull()
			expect(userRepository.save).toHaveBeenCalled()
		})

		it('should soft-remove manager by owner', async () => {
			;(userRepository.findOne as jest.Mock).mockResolvedValue(mockManager)
			;(userRepository.save as jest.Mock).mockResolvedValue({ ...mockManager, removedAt: new Date() })

			const result = await service.remove(mockOwner, mockManager.id)

			expect(result.removedAt).not.toBeNull()
		})

		it('should throw ForbiddenException when trying to remove owner', async () => {
			jest.spyOn(userRepository, 'findOne').mockResolvedValueOnce(mockOwner)

			await expect(service.remove(mockOwner, mockOwner.id)).rejects.toThrow(ForbiddenException)
		})

		it('should throw ForbiddenException when manager tries to remove another manager', async () => {
			jest.spyOn(userRepository, 'findOne').mockResolvedValueOnce(mockManager)

			await expect(service.remove(mockManager, mockManager.id)).rejects.toThrow(ForbiddenException)
		})

		it('should throw ForbiddenException when waiter tries to remove anyone', async () => {
			jest.spyOn(userRepository, 'findOne').mockResolvedValueOnce(mockUser)

			await expect(service.remove(mockUser, mockManager.id)).rejects.toThrow(ForbiddenException)
		})

		it('should throw NotFoundException if target not in same business', async () => {
			const otherBusinessUser = { ...mockUser, businessId: 'business-2' }
			jest.spyOn(userRepository, 'findOne').mockResolvedValueOnce(otherBusinessUser)

			await expect(service.remove(mockManager, mockUser.id)).rejects.toThrow(NotFoundException)
		})
	})

	describe('leaveBusiness', () => {
		it('should let a manager leave, revoke their sessions, and revoke their pending invites', async () => {
			const managerCopy = { ...mockManager }
			jest.spyOn(userRepository, 'findOne').mockResolvedValue(managerCopy)
			jest.spyOn(userRepository, 'save').mockResolvedValue({ ...managerCopy, removedAt: new Date() })

			await service.leaveBusiness(mockManager.id)

			expect(inviteRepository.update).toHaveBeenCalledWith(
				{ businessId: mockManager.businessId, createdByUserId: mockManager.id, status: 'pending' },
				{ status: 'revoked' },
			)
			expect(adminPanelSessions.revokeAllForUser).toHaveBeenCalledWith(mockManager.id)
			expect(membershipEvents.publish).toHaveBeenCalledWith(expect.objectContaining({ kind: 'left', businessId: mockManager.businessId }))
		})

		it('should reject an owner leaving', async () => {
			jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockOwner)

			await expect(service.leaveBusiness(mockOwner.id)).rejects.toThrow(ForbiddenException)
		})
	})

	describe('isActiveMemberOf', () => {
		it('should return true for active member in same business', () => {
			const result = service.isActiveMemberOf(mockUser, 'business-1')
			expect(result).toBe(true)
		})

		it('should return false for null user', () => {
			const result = service.isActiveMemberOf(null, 'business-1')
			expect(result).toBe(false)
		})

		it('should return false for soft-deleted user', () => {
			const removedUser = { ...mockUser, removedAt: new Date() }
			const result = service.isActiveMemberOf(removedUser, 'business-1')
			expect(result).toBe(false)
		})

		it('should return false for different business', () => {
			const result = service.isActiveMemberOf(mockUser, 'business-2')
			expect(result).toBe(false)
		})
	})

	describe('hasRoleAtLeast', () => {
		it('should return true for same or higher role', () => {
			expect(service.hasRoleAtLeast(mockOwner, 'manager')).toBe(true)
			expect(service.hasRoleAtLeast(mockManager, 'waiter')).toBe(true)
			expect(service.hasRoleAtLeast(mockUser, 'waiter')).toBe(true)
		})

		it('should return false for lower role', () => {
			expect(service.hasRoleAtLeast(mockUser, 'manager')).toBe(false)
			expect(service.hasRoleAtLeast(mockManager, 'owner')).toBe(false)
		})
	})

	describe('findById', () => {
		it('should return user by id', async () => {
			jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser)
			const result = await service.findById('user-1')
			expect(result).toEqual(mockUser)
			expect(userRepository.findOne).toHaveBeenCalledWith({ where: { id: 'user-1', removedAt: IsNull() } })
		})

		it('should return null when user not found', async () => {
			jest.spyOn(userRepository, 'findOne').mockResolvedValue(null)
			const result = await service.findById('invalid-id')
			expect(result).toBeNull()
		})
	})

	describe('getBusinessStaff', () => {
		it('should return all active staff in business', async () => {
			const staff = [mockUser, mockManager, mockOwner]
			jest.spyOn(userRepository, 'find').mockResolvedValue(staff)

			const result = await service.getBusinessStaff('business-1')

			expect(result).toEqual(staff)
			expect(userRepository.find).toHaveBeenCalledWith({
				where: { businessId: 'business-1', removedAt: expect.any(Object) },
				order: { role: 'DESC', displayName: 'ASC' },
			})
		})

		it('should return empty array when no staff in business', async () => {
			jest.spyOn(userRepository, 'find').mockResolvedValue([])
			const result = await service.getBusinessStaff('empty-business')
			expect(result).toEqual([])
		})
	})
})
