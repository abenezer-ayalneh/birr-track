import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { Business } from './entities/business.entity'

export type CreateBusinessParams = {
	name: string
	ownerUserId?: string
}

@Injectable()
export class BusinessesService {
	private readonly logger = new Logger(BusinessesService.name)

	constructor(
		@InjectRepository(Business)
		private readonly businessRepository: Repository<Business>,
	) {}

	/**
	 * Create a new business with pending status.
	 */
	async create(params: CreateBusinessParams): Promise<Business> {
		const business = this.businessRepository.create({
			name: params.name,
			status: 'pending',
			ownerUserId: params.ownerUserId,
		})

		const saved = await this.businessRepository.save(business)
		this.logger.log(`Business created: ${saved.id} (${saved.name})`)
		return saved
	}

	/**
	 * Find a business by ID.
	 */
	async findById(id: string): Promise<Business | null> {
		return this.businessRepository.findOne({ where: { id } })
	}

	/**
	 * Save a business (update).
	 */
	async save(business: Business): Promise<Business> {
		const saved = await this.businessRepository.save(business)
		this.logger.log(`Business updated: ${saved.id} (status: ${saved.status})`)
		return saved
	}

	async getAllBusinesses(): Promise<Business[]> {
		return this.businessRepository.find({
			order: { createdAt: 'DESC' },
		})
	}

	async suspendBusiness(businessId: string): Promise<{ status: string; message: string }> {
		const business = await this.businessRepository.findOne({ where: { id: businessId } })
		if (!business) {
			throw new NotFoundException(`Business ${businessId} not found`)
		}

		// Idempotent: suspending an already-suspended business is a no-op success
		if (business.status === 'suspended') {
			this.logger.log(`Business ${businessId} already suspended (idempotent suspend)`)
			return { status: 'suspended', message: 'Business is already suspended' }
		}

		business.status = 'suspended'
		await this.businessRepository.save(business)

		this.logger.log(`Business ${businessId} suspended`)
		return { status: 'suspended', message: 'Business suspended successfully' }
	}

	async unsuspendBusiness(businessId: string): Promise<{ status: string; message: string }> {
		const business = await this.businessRepository.findOne({ where: { id: businessId } })
		if (!business) {
			throw new NotFoundException(`Business ${businessId} not found`)
		}

		if (business.status !== 'suspended') {
			throw new ConflictException(`Business ${businessId} is not suspended`)
		}

		business.status = 'active'
		await this.businessRepository.save(business)

		this.logger.log(`Business ${businessId} unsuspended`)
		return { status: 'active', message: 'Business unsuspended successfully' }
	}
}
