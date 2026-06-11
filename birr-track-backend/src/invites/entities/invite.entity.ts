import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'

import { Business } from '../../businesses/entities/business.entity'
import { User, UserRole } from '../../users/entities/user.entity'

export const INVITE_ROLES = ['waiter', 'manager'] as const satisfies readonly UserRole[]
export type InviteRole = (typeof INVITE_ROLES)[number]

export const INVITE_STATUSES = ['pending', 'redeemed', 'revoked', 'expired'] as const
export type InviteStatus = (typeof INVITE_STATUSES)[number]

@Entity('invites')
@Index('idx_invite_business_id', ['businessId'])
@Index('uq_invite_pending_invitee', ['inviteeTelegramId'], { unique: true, where: `"status" = 'pending'` })
export class Invite {
	@PrimaryGeneratedColumn('uuid')
	id!: string

	@Column({ type: 'bigint' })
	inviteeTelegramId!: string

	@Column({ type: 'uuid' })
	businessId!: string

	@Column({ type: 'varchar', length: 20 })
	role!: InviteRole

	@Column({ type: 'uuid' })
	createdByUserId!: string

	@Column({ type: 'varchar', length: 20, default: 'pending' })
	status!: InviteStatus

	@Column({ type: 'timestamptz' })
	expiresAt!: Date

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date

	@ManyToOne(() => Business, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'businessId' })
	business!: Business

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'createdByUserId' })
	createdBy!: User
}
