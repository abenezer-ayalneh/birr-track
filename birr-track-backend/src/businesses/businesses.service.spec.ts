import { ConflictException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { BusinessesService } from './businesses.service'
import { Business } from './entities/business.entity'

describe('BusinessesService', () => {
	let service: BusinessesService
	let businessRepo: Repository<Business>

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				BusinessesService,
				{
					provide: getRepositoryToken(Business),
					useValue: {
						find: jest.fn(),
						findOne: jest.fn(),
						save: jest.fn(),
					},
				},
			],
		}).compile()

		service = module.get<BusinessesService>(BusinessesService)
		businessRepo = module.get<Repository<Business>>(getRepositoryToken(Business))
	})

	describe('suspendBusiness', () => {
		it('should suspend an active business', async () => {
			const business = { id: '123', status: 'active', name: 'Test Business' } as Business
			jest.spyOn(businessRepo, 'findOne').mockResolvedValue(business)
			jest.spyOn(businessRepo, 'save').mockResolvedValue({ ...business, status: 'suspended' } as Business)

			const result = await service.suspendBusiness('123')

			expect(result.status).toBe('suspended')
			expect(businessRepo.save).toHaveBeenCalled()
		})

		it('should be idempotent for already suspended businesses', async () => {
			const business = { id: '123', status: 'suspended', name: 'Test Business' } as Business
			jest.spyOn(businessRepo, 'findOne').mockResolvedValue(business)

			const result = await service.suspendBusiness('123')

			expect(result.status).toBe('suspended')
			expect(businessRepo.save).not.toHaveBeenCalled()
		})

		it('should throw error for non-existent business', async () => {
			jest.spyOn(businessRepo, 'findOne').mockResolvedValue(null)

			await expect(service.suspendBusiness('invalid-id')).rejects.toThrow(NotFoundException)
		})
	})

	describe('unsuspendBusiness', () => {
		it('should unsuspend a suspended business', async () => {
			const business = { id: '123', status: 'suspended', name: 'Test Business' } as Business
			jest.spyOn(businessRepo, 'findOne').mockResolvedValue(business)
			jest.spyOn(businessRepo, 'save').mockResolvedValue({ ...business, status: 'active' } as Business)

			const result = await service.unsuspendBusiness('123')

			expect(result.status).toBe('active')
			expect(businessRepo.save).toHaveBeenCalled()
		})

		it('should throw error when trying to unsuspend non-suspended business', async () => {
			const business = { id: '123', status: 'active', name: 'Test Business' } as Business
			jest.spyOn(businessRepo, 'findOne').mockResolvedValue(business)

			await expect(service.unsuspendBusiness('123')).rejects.toThrow(ConflictException)
		})

		it('should throw error for non-existent business', async () => {
			jest.spyOn(businessRepo, 'findOne').mockResolvedValue(null)

			await expect(service.unsuspendBusiness('invalid-id')).rejects.toThrow(NotFoundException)
		})
	})
})
