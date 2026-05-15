import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm'

import { EditLog } from './edit-log.entity'

@Entity('transactions')
@Index('idx_transaction_duplicate_lookup', ['transactionId', 'amount', 'timestamp'])
@Index('idx_transaction_telegram_user_id', ['telegramUserId'])
@Index('idx_transaction_created_at', ['createdAt'])
export class Transaction {
	@PrimaryGeneratedColumn('uuid')
	id!: string

	@Column({ type: 'bigint' })
	telegramUserId!: string

	@Column({ type: 'varchar', length: 255 })
	telegramName!: string

	@Column({ type: 'numeric', precision: 14, scale: 2 })
	amount!: string

	@Column({ type: 'varchar', length: 128 })
	transactionId!: string

	@Column({ type: 'timestamptz' })
	timestamp!: Date

	@Column({ type: 'varchar', length: 120 })
	bankName!: string

	@Column({ type: 'float' })
	confidence!: number

	@Column({ type: 'boolean', default: false })
	isDuplicate!: boolean

	@Column({ type: 'text', nullable: true })
	imageUrl!: string | null

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date

	@OneToMany(() => EditLog, (editLog) => editLog.transaction)
	editLogs!: EditLog[]
}
