import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'

import { User, UserRole } from './entities/user.entity'

const ROLE_RANK: Record<UserRole, number> = { waiter: 1, manager: 2, owner: 3 }

export type JoinBusinessParams = {
	telegramUserId: string
	displayName: string
	businessId: string
	role: UserRole
}

@Injectable()
export class UsersService {
	private readonly logger = new Logger(UsersService.name)

	constructor(
		@InjectRepository(User)
		private readonly userRepository: Repository<User>,
		private readonly configService: ConfigService,
	) {}

	/** The Platform Owner is the app operator, identified by env var — not a `users` row. */
	isPlatformOwner(telegramUserId: string): boolean {
		const platformOwnerId = this.configService.get<string>('PLATFORM_OWNER_TELEGRAM_ID')?.trim()
		return Boolean(platformOwnerId) && platformOwnerId === telegramUserId.trim()
	}

	/** Active membership only — removed users do not resolve. */
	async findByTelegramId(telegramUserId: string): Promise<User | null> {
		return this.userRepository.findOne({ where: { telegramUserId, removedAt: IsNull() } })
	}

	/** Any row, including soft-removed ones (e.g. to reactivate on invite redemption). */
	async findAnyByTelegramId(telegramUserId: string): Promise<User | null> {
		return this.userRepository.findOne({ where: { telegramUserId } })
	}

	isActiveMemberOf(user: User | null, businessId: string): boolean {
		return user !== null && user.removedAt === null && user.businessId === businessId
	}

	hasRoleAtLeast(user: User, role: UserRole): boolean {
		return ROLE_RANK[user.role] >= ROLE_RANK[role]
	}

	/**
	 * Adds a Telegram account to a business, reactivating a soft-removed row if one exists
	 * (telegramUserId is unique — one row per account, ever).
	 */
	async joinBusiness(params: JoinBusinessParams): Promise<User> {
		const existing = await this.findAnyByTelegramId(params.telegramUserId)

		if (existing && existing.removedAt === null) {
			throw new ConflictException(`Telegram account ${params.telegramUserId} already belongs to a business`)
		}

		if (existing) {
			existing.displayName = params.displayName
			existing.businessId = params.businessId
			existing.role = params.role
			existing.removedAt = null
			return this.userRepository.save(existing)
		}

		const user = this.userRepository.create({
			telegramUserId: params.telegramUserId,
			displayName: params.displayName,
			businessId: params.businessId,
			role: params.role,
		})
		return this.userRepository.save(user)
	}

	/** Waiter → manager. Only the owner manages managers, and promotion creates one. */
	async promoteToManager(actor: User, targetUserId: string): Promise<User> {
		const target = await this.findActiveTeammate(actor, targetUserId)

		if (actor.role !== 'owner') {
			throw new ForbiddenException('Only the owner can promote to manager')
		}
		if (target.role !== 'waiter') {
			throw new ConflictException(`User ${targetUserId} is not a waiter`)
		}

		target.role = 'manager'
		const saved = await this.userRepository.save(target)
		this.logger.log(`User ${target.id} promoted to manager by ${actor.id}`)
		return saved
	}

	/** Manager → waiter. Only the owner manages managers; the owner cannot be demoted. */
	async demoteToWaiter(actor: User, targetUserId: string): Promise<User> {
		const target = await this.findActiveTeammate(actor, targetUserId)

		if (target.role === 'owner') {
			throw new ForbiddenException('The owner cannot be demoted')
		}
		if (actor.role !== 'owner') {
			throw new ForbiddenException('Only the owner can demote a manager')
		}
		if (target.role !== 'manager') {
			throw new ConflictException(`User ${targetUserId} is not a manager`)
		}

		target.role = 'waiter'
		const saved = await this.userRepository.save(target)
		this.logger.log(`User ${target.id} demoted to waiter by ${actor.id}`)
		return saved
	}

	/**
	 * Soft removal — sets `removedAt` so the user's Transactions stay attributable.
	 * Managers can remove waiters; only the owner can remove managers; the owner cannot be removed.
	 */
	async remove(actor: User, targetUserId: string): Promise<User> {
		const target = await this.findActiveTeammate(actor, targetUserId)

		if (target.role === 'owner') {
			throw new ForbiddenException('The owner cannot be removed')
		}
		if (target.role === 'manager' && actor.role !== 'owner') {
			throw new ForbiddenException('Only the owner can remove a manager')
		}
		if (target.role === 'waiter' && !this.hasRoleAtLeast(actor, 'manager')) {
			throw new ForbiddenException('Only a manager or the owner can remove a waiter')
		}

		target.removedAt = new Date()
		const saved = await this.userRepository.save(target)
		this.logger.log(`User ${target.id} removed by ${actor.id}`)
		return saved
	}

	private async findActiveTeammate(actor: User, targetUserId: string): Promise<User> {
		const target = await this.userRepository.findOne({ where: { id: targetUserId, removedAt: IsNull() } })
		if (!target || actor.businessId === null || target.businessId !== actor.businessId) {
			throw new NotFoundException(`User ${targetUserId} not found in this business`)
		}
		return target
	}
}
