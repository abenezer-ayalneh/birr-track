import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'

import { Business } from './business.entity'

@Entity('managers')
@Index('idx_manager_business_id', ['businessId'])
export class Manager {
	@PrimaryGeneratedColumn('uuid')
	id!: string

	@Column({ type: 'uuid' })
	businessId!: string

	@Column({ type: 'varchar', length: 255, unique: true })
	email!: string

	@Column({ type: 'varchar', length: 255 })
	passwordHash!: string

	@ManyToOne(() => Business, (business) => business.managers, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'businessId' })
	business!: Business
}
