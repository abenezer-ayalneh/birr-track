import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { Business, BusinessStatus } from '../businesses/entities/business.entity'
import { User } from '../users/entities/user.entity'

export type RegistrationDecision = {
	status: BusinessStatus
	message: string
	/** False when the call was an idempotent no-op (business already in the target status). */
	changed: boolean
	business: Business
}

export type PendingRegistration = {
	businessId: string
	businessName: string
	status: string
	registrant: {
		userId: string
		telegramUserId: string
		displayName: string
	}
	createdAt: Date
}

@Injectable()
export class RegistrationsService {
	private readonly logger = new Logger(RegistrationsService.name)

	constructor(
		@InjectRepository(Business)
		private readonly businessRepository: Repository<Business>,
		@InjectRepository(User)
		private readonly userRepository: Repository<User>,
	) {}

	async getPendingRegistrations(): Promise<PendingRegistration[]> {
		const businesses = await this.businessRepository.find({ where: { status: 'pending' } })

		const result: PendingRegistration[] = []

		for (const business of businesses) {
			if (!business.ownerUserId) {
				continue
			}

			const owner = await this.userRepository.findOne({ where: { id: business.ownerUserId } })
			if (!owner) {
				continue
			}

			result.push({
				businessId: business.id,
				businessName: business.name,
				status: business.status,
				registrant: {
					userId: owner.id,
					telegramUserId: owner.telegramUserId.toString(),
					displayName: owner.displayName,
				},
				createdAt: business.createdAt,
			})
		}

		return result.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
	}

	async approveBusiness(businessId: string): Promise<RegistrationDecision> {
		const business = await this.businessRepository.findOne({ where: { id: businessId } })
		if (!business) {
			throw new NotFoundException(`Business ${businessId} not found`)
		}

		// Idempotent: approving an already-active business is a no-op success
		if (business.status === 'active') {
			this.logger.log(`Business ${businessId} already active (idempotent approve)`)
			return { status: 'active', message: 'Business is already active', changed: false, business }
		}

		// Cannot approve a rejected business
		if (business.status === 'rejected') {
			throw new ConflictException(`Cannot approve a rejected business ${businessId}`)
		}

		if (business.status === 'suspended') {
			throw new ConflictException(`Cannot approve a suspended business ${businessId}`)
		}

		business.status = 'active'
		await this.businessRepository.save(business)
		await this.promoteRegistrantToOwner(business)

		this.logger.log(`Business ${businessId} approved`)
		return { status: 'active', message: 'Business approved successfully', changed: true, business }
	}

	async rejectBusiness(businessId: string): Promise<RegistrationDecision> {
		const business = await this.businessRepository.findOne({ where: { id: businessId } })
		if (!business) {
			throw new NotFoundException(`Business ${businessId} not found`)
		}

		// Idempotent: rejecting an already-rejected business is a no-op success
		if (business.status === 'rejected') {
			this.logger.log(`Business ${businessId} already rejected (idempotent reject)`)
			return { status: 'rejected', message: 'Business is already rejected', changed: false, business }
		}

		// Cannot reject an active business
		if (business.status === 'active') {
			throw new ConflictException(`Cannot reject an active business ${businessId}`)
		}

		if (business.status === 'suspended') {
			throw new ConflictException(`Cannot reject a suspended business ${businessId}`)
		}

		business.status = 'rejected'
		await this.businessRepository.save(business)

		this.logger.log(`Business ${businessId} rejected`)
		return { status: 'rejected', message: 'Business rejected successfully', changed: true, business }
	}

	/** Spec §3.1: on approve the registrant becomes Owner. No-op if already owner or missing. */
	private async promoteRegistrantToOwner(business: Business): Promise<void> {
		if (!business.ownerUserId) {
			return
		}

		const registrant = await this.userRepository.findOne({ where: { id: business.ownerUserId } })
		if (!registrant) {
			this.logger.warn(`Registrant ${business.ownerUserId} for business ${business.id} not found; skipping owner promotion`)
			return
		}

		if (registrant.role === 'owner') {
			return
		}

		registrant.role = 'owner'
		await this.userRepository.save(registrant)
		this.logger.log(`User ${registrant.id} promoted to owner of business ${business.id}`)
	}
}
