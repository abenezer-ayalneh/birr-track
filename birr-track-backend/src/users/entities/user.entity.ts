import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'

import { Business } from '../../businesses/entities/business.entity'

export const USER_ROLES = ['waiter', 'manager', 'owner'] as const
export type UserRole = (typeof USER_ROLES)[number]
export const SUPPORTED_LANGUAGES = ['en', 'am'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

@Entity('users')
@Index('idx_user_business_id', ['businessId'])
export class User {
	@PrimaryGeneratedColumn('uuid')
	id!: string

	@Column({ type: 'bigint', unique: true })
	telegramUserId!: string

	@Column({ type: 'varchar', length: 255 })
	displayName!: string

	@Column({ type: 'uuid', nullable: true })
	businessId!: string | null

	@Column({ type: 'varchar', length: 20 })
	role!: UserRole

	@Column({ type: 'varchar', length: 2, default: 'en' })
	language!: SupportedLanguage

	@Column({ type: 'timestamptz', nullable: true })
	removedAt!: Date | null

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date

	@ManyToOne(() => Business, { onDelete: 'SET NULL' })
	@JoinColumn({ name: 'businessId' })
	business!: Business | null
}
