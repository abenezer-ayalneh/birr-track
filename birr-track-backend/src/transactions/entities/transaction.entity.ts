import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm'

import { Business } from '../../businesses/entities/business.entity'
import { User } from '../../users/entities/user.entity'
import { EditLog } from './edit-log.entity'

export const TRANSACTION_STATUSES = ['recorded', 'needs_review'] as const
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number]

@Entity('transactions')
@Index('idx_transaction_duplicate_lookup', ['transactionId', 'amount', 'timestamp'])
@Index('idx_transaction_telegram_user_id', ['telegramUserId'])
@Index('idx_transaction_created_at', ['createdAt'])
@Index('idx_transaction_business_id', ['businessId'])
export class Transaction {
	@PrimaryGeneratedColumn('uuid')
	id!: string

	/** Denormalized capture data — kept even though `userId` links to the submitting user. */
	@Column({ type: 'bigint' })
	telegramUserId!: string

	@Column({ type: 'varchar', length: 255 })
	telegramName!: string

	@Column({ type: 'uuid', nullable: true })
	businessId!: string | null

	@Column({ type: 'uuid', nullable: true })
	userId!: string | null

	@Column({ type: 'varchar', length: 20, default: 'recorded' })
	status!: TransactionStatus

	@Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
	amount!: string | null

	@Column({ type: 'varchar', length: 128, nullable: true })
	transactionId!: string | null

	@Column({ type: 'timestamptz', nullable: true })
	timestamp!: Date | null

	@Column({ type: 'varchar', length: 120, nullable: true })
	bankName!: string | null

	@Column({ type: 'float' })
	confidence!: number

	@Column({ type: 'boolean', default: false })
	isDuplicate!: boolean

	@Column({ type: 'boolean', default: false })
	editedByUploader!: boolean

	@Column({ type: 'text', nullable: true })
	imageKey!: string | null

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date

	@ManyToOne(() => Business, { onDelete: 'SET NULL' })
	@JoinColumn({ name: 'businessId' })
	business!: Business | null

	@ManyToOne(() => User, { onDelete: 'SET NULL' })
	@JoinColumn({ name: 'userId' })
	user!: User | null

	@OneToMany(() => EditLog, (editLog) => editLog.transaction)
	editLogs!: EditLog[]
}
