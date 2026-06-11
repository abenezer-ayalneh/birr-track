import { Injectable, Logger } from '@nestjs/common'
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
}
