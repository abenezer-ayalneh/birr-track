import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'

import { Transaction } from './transaction.entity'

@Entity('edit_logs')
@Index('idx_edit_log_transaction_id', ['transactionId'])
export class EditLog {
	@PrimaryGeneratedColumn('uuid')
	id!: string

	@Column({ type: 'uuid' })
	transactionId!: string

	@Column({ type: 'varchar', length: 80 })
	fieldName!: string

	@Column({ type: 'text', nullable: true })
	oldValue!: string | null

	@Column({ type: 'text', nullable: true })
	newValue!: string | null

	@Column({ type: 'varchar', length: 120 })
	editedBy!: string

	@CreateDateColumn({ type: 'timestamptz' })
	editedAt!: Date

	@ManyToOne(() => Transaction, (transaction) => transaction.editLogs, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'transactionId' })
	transaction!: Transaction
}
