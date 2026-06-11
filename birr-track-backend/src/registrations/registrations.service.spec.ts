/* eslint-disable @typescript-eslint/unbound-method */
import { ConflictException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { Business } from '../businesses/entities/business.entity'
import { User } from '../users/entities/user.entity'
import { RegistrationsService } from './registrations.service'

describe('RegistrationsService', () => {
	let service: RegistrationsService
	let businessRepo: Repository<Business>
	let userRepo: Repository<User>

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				RegistrationsService,
				{
					provide: getRepositoryToken(Business),
					useValue: {
						find: jest.fn(),
						findOne: jest.fn(),
						save: jest.fn(),
					},
				},
				{
					provide: getRepositoryToken(User),
					useValue: {
						findOne: jest.fn(),
						save: jest.fn(),
					},
				},
			],
		}).compile()

		service = module.get<RegistrationsService>(RegistrationsService)
		businessRepo = module.get<Repository<Business>>(getRepositoryToken(Business))
		userRepo = module.get<Repository<User>>(getRepositoryToken(User))
	})

	describe('approveBusiness', () => {
		it('should approve a pending business', async () => {
			const business = { id: '123', status: 'pending', name: 'Test Business' } as Business
			jest.spyOn(businessRepo, 'findOne').mockResolvedValue(business)
			jest.spyOn(businessRepo, 'save').mockResolvedValue({ ...business, status: 'active' } as Business)

			const result = await service.approveBusiness('123')

			expect(result.status).toBe('active')
			expect(result.changed).toBe(true)
			expect(businessRepo.save).toHaveBeenCalled()
		})

		it('should promote the registrant to owner on approval', async () => {
			const business = { id: '123', status: 'pending', name: 'Test Business', ownerUserId: 'user-1' } as Business
			const registrant = { id: 'user-1', role: 'waiter' } as User
			jest.spyOn(businessRepo, 'findOne').mockResolvedValue(business)
			jest.spyOn(businessRepo, 'save').mockResolvedValue({ ...business, status: 'active' } as Business)
			jest.spyOn(userRepo, 'findOne').mockResolvedValue(registrant)
			jest.spyOn(userRepo, 'save').mockImplementation((user) => Promise.resolve(user as User))

			const result = await service.approveBusiness('123')

			expect(result.status).toBe('active')
			expect(userRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1', role: 'owner' }))
		})

		it('should not re-save a registrant who is already owner', async () => {
			const business = { id: '123', status: 'pending', name: 'Test Business', ownerUserId: 'user-1' } as Business
			const registrant = { id: 'user-1', role: 'owner' } as User
			jest.spyOn(businessRepo, 'findOne').mockResolvedValue(business)
			jest.spyOn(businessRepo, 'save').mockResolvedValue({ ...business, status: 'active' } as Business)
			jest.spyOn(userRepo, 'findOne').mockResolvedValue(registrant)

			await service.approveBusiness('123')

			expect(userRepo.save).not.toHaveBeenCalled()
		})

		it('should be idempotent for already active businesses', async () => {
			const business = { id: '123', status: 'active', name: 'Test Business' } as Business
			jest.spyOn(businessRepo, 'findOne').mockResolvedValue(business)

			const result = await service.approveBusiness('123')

			expect(result.status).toBe('active')
			expect(result.changed).toBe(false)
			expect(businessRepo.save).not.toHaveBeenCalled()
		})

		it('should throw error for non-existent business', async () => {
			jest.spyOn(businessRepo, 'findOne').mockResolvedValue(null)

			await expect(service.approveBusiness('invalid-id')).rejects.toThrow(NotFoundException)
		})

		it('should throw error when approving rejected business', async () => {
			const business = { id: '123', status: 'rejected', name: 'Test Business' } as Business
			jest.spyOn(businessRepo, 'findOne').mockResolvedValue(business)

			await expect(service.approveBusiness('123')).rejects.toThrow(ConflictException)
		})
	})

	describe('rejectBusiness', () => {
		it('should reject a pending business', async () => {
			const business = { id: '123', status: 'pending', name: 'Test Business' } as Business
			jest.spyOn(businessRepo, 'findOne').mockResolvedValue(business)
			jest.spyOn(businessRepo, 'save').mockResolvedValue({ ...business, status: 'rejected' } as Business)

			const result = await service.rejectBusiness('123')

			expect(result.status).toBe('rejected')
			expect(result.changed).toBe(true)
			expect(businessRepo.save).toHaveBeenCalled()
		})

		it('should be idempotent for already rejected businesses', async () => {
			const business = { id: '123', status: 'rejected', name: 'Test Business' } as Business
			jest.spyOn(businessRepo, 'findOne').mockResolvedValue(business)

			const result = await service.rejectBusiness('123')

			expect(result.status).toBe('rejected')
			expect(result.changed).toBe(false)
			expect(businessRepo.save).not.toHaveBeenCalled()
		})

		it('should throw error when rejecting active business', async () => {
			const business = { id: '123', status: 'active', name: 'Test Business' } as Business
			jest.spyOn(businessRepo, 'findOne').mockResolvedValue(business)

			await expect(service.rejectBusiness('123')).rejects.toThrow(ConflictException)
		})
	})
})
