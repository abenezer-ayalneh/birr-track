import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { LessThanOrEqual, Repository } from 'typeorm'

import { User } from '../users/entities/user.entity'
import { UsersService } from '../users/users.service'
import { Invite, InviteRole } from './entities/invite.entity'

export const DEFAULT_INVITE_TTL_DAYS = 7
export const MAX_INVITE_BATCH_SIZE = 10
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

export type CreateInviteParams = {
	inviteeTelegramId: string
	businessId: string
	role: InviteRole
	createdByUserId: string
}

export type CreateInviteBatchParams = Omit<CreateInviteParams, 'inviteeTelegramId'> & {
	inviteeTelegramIds: string[]
}

export type InviteBatchOutcome =
	| { inviteeTelegramId: string; status: 'created'; invite: Invite }
	| { inviteeTelegramId: string; status: 'skipped_active_member' }
	| { inviteeTelegramId: string; status: 'failed' }

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
	 * Creates independent Invites for a picker selection. Membership conflicts and unexpected
	 * persistence errors apply only to the affected Telegram account so a valid batch can proceed.
	 */
	async createBatch(params: CreateInviteBatchParams): Promise<InviteBatchOutcome[]> {
		const inviteeTelegramIds = [...new Set(params.inviteeTelegramIds.map((id) => id.trim()).filter(Boolean))]
		if (inviteeTelegramIds.length === 0 || inviteeTelegramIds.length > MAX_INVITE_BATCH_SIZE) {
			throw new BadRequestException(`Invite batches must contain between 1 and ${MAX_INVITE_BATCH_SIZE} Telegram accounts`)
		}

		const outcomes: InviteBatchOutcome[] = []
		for (const inviteeTelegramId of inviteeTelegramIds) {
			try {
				const invite = await this.create({ ...params, inviteeTelegramId })
				outcomes.push({ inviteeTelegramId, status: 'created', invite })
			} catch (err) {
				if (err instanceof ConflictException) {
					outcomes.push({ inviteeTelegramId, status: 'skipped_active_member' })
					continue
				}

				outcomes.push({ inviteeTelegramId, status: 'failed' })
				const reason = err instanceof Error ? err.message : 'Unknown error'
				this.logger.error(`Failed to create invite for telegram user ${inviteeTelegramId}: ${reason}`)
			}
		}

		return outcomes
	}

	/**
	 * Redeems the pending Invite for a Telegram account, joining them to the business.
	 * Returns null when there is nothing to redeem (no pending Invite, or it has expired).
	 */
	async redeem(telegramUserId: string, displayName: string): Promise<RedeemedInvite | null> {
		const invite = await this.inviteRepository.findOne({
			where: { inviteeTelegramId: telegramUserId, status: 'pending' },
			relations: { business: true, createdBy: true },
		})
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

	/**
	 * Returns the pending Invite for a Telegram account without redeeming it.
	 * The Mini App uses this to make an Invite take precedence over registration.
	 */
	async findPendingForTelegramId(telegramUserId: string): Promise<Invite | null> {
		const invite = await this.inviteRepository.findOne({
			where: { inviteeTelegramId: telegramUserId, status: 'pending' },
			relations: { business: true },
		})
		if (!invite) return null

		if (invite.expiresAt.getTime() <= Date.now()) {
			invite.status = 'expired'
			await this.inviteRepository.save(invite)
			return null
		}

		return invite
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
