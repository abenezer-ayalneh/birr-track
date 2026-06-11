import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { LessThanOrEqual, Repository } from 'typeorm'

import { User } from '../users/entities/user.entity'
import { UsersService } from '../users/users.service'
import { Invite, InviteRole } from './entities/invite.entity'

export const DEFAULT_INVITE_TTL_DAYS = 7
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

export type CreateInviteParams = {
	inviteeTelegramId: string
	businessId: string
	role: InviteRole
	createdByUserId: string
}

export type RedeemedInvite = {
	invite: Invite
	user: User
}

@Injectable()
export class InvitesService {
	private readonly logger = new Logger(InvitesService.name)

	constructor(
		@InjectRepository(Invite)
		private readonly inviteRepository: Repository<Invite>,
		private readonly usersService: UsersService,
		private readonly configService: ConfigService,
	) {}

	/**
	 * Creates a pending Invite bound to the invitee's Telegram ID, replacing (revoking) any
	 * prior pending Invite for that ID — one pending Invite per account, same as one-account-one-business.
	 */
	async create(params: CreateInviteParams): Promise<Invite> {
		const existingMember = await this.usersService.findByTelegramId(params.inviteeTelegramId)
		if (existingMember) {
			throw new ConflictException(`Telegram account ${params.inviteeTelegramId} already belongs to a business`)
		}

		await this.inviteRepository.update({ inviteeTelegramId: params.inviteeTelegramId, status: 'pending' }, { status: 'revoked' })

		const invite = this.inviteRepository.create({
			inviteeTelegramId: params.inviteeTelegramId,
			businessId: params.businessId,
			role: params.role,
			createdByUserId: params.createdByUserId,
			status: 'pending',
			expiresAt: new Date(Date.now() + this.inviteTtlDays() * MILLISECONDS_PER_DAY),
		})

		const saved = await this.inviteRepository.save(invite)
		this.logger.log(`Invite ${saved.id} created for telegram user ${params.inviteeTelegramId} (${params.role})`)
		return saved
	}

	/**
	 * Redeems the pending Invite for a Telegram account, joining them to the business.
	 * Returns null when there is nothing to redeem (no pending Invite, or it has expired).
	 */
	async redeem(telegramUserId: string, displayName: string): Promise<RedeemedInvite | null> {
		const invite = await this.inviteRepository.findOne({ where: { inviteeTelegramId: telegramUserId, status: 'pending' } })
		if (!invite) {
			return null
		}

		if (invite.expiresAt.getTime() <= Date.now()) {
			invite.status = 'expired'
			await this.inviteRepository.save(invite)
			return null
		}

		const user = await this.usersService.joinBusiness({
			telegramUserId,
			displayName,
			businessId: invite.businessId,
			role: invite.role,
		})

		invite.status = 'redeemed'
		const saved = await this.inviteRepository.save(invite)
		this.logger.log(`Invite ${saved.id} redeemed by telegram user ${telegramUserId}`)
		return { invite: saved, user }
	}

	async revoke(inviteId: string): Promise<Invite> {
		const invite = await this.inviteRepository.findOne({ where: { id: inviteId } })
		if (!invite) {
			throw new NotFoundException(`Invite ${inviteId} not found`)
		}
		if (invite.status !== 'pending') {
			throw new ConflictException(`Invite ${inviteId} is ${invite.status}, only pending invites can be revoked`)
		}

		invite.status = 'revoked'
		return this.inviteRepository.save(invite)
	}

	async revokeByIdAndBusiness(inviteId: string, businessId: string): Promise<Invite> {
		const invite = await this.inviteRepository.findOne({ where: { id: inviteId } })
		if (!invite) {
			throw new NotFoundException(`Invite ${inviteId} not found`)
		}
		if (invite.businessId !== businessId) {
			throw new NotFoundException(`Invite ${inviteId} not found in this business`)
		}
		if (invite.status !== 'pending') {
			throw new ConflictException(`Invite ${inviteId} is ${invite.status}, only pending invites can be revoked`)
		}

		invite.status = 'revoked'
		return this.inviteRepository.save(invite)
	}

	async getPendingInvitesByBusiness(businessId: string): Promise<Invite[]> {
		return this.inviteRepository.find({
			where: { businessId, status: 'pending' },
			relations: ['createdBy'],
			order: { createdAt: 'DESC' },
		})
	}

	/** Marks all pending Invites past their expiry as expired; returns how many were affected. */
	async expirePending(): Promise<number> {
		const result = await this.inviteRepository.update({ status: 'pending', expiresAt: LessThanOrEqual(new Date()) }, { status: 'expired' })
		return result.affected ?? 0
	}

	private inviteTtlDays(): number {
		const configured = Number(this.configService.get<string>('INVITE_TTL_DAYS'))
		return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_INVITE_TTL_DAYS
	}
}
