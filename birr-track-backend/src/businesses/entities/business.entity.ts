import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'

export const BUSINESS_STATUSES = ['pending', 'active', 'rejected', 'suspended'] as const
export type BusinessStatus = (typeof BUSINESS_STATUSES)[number]

@Entity('businesses')
export class Business {
	@PrimaryGeneratedColumn('uuid')
	id!: string

	/** Display label only — duplicates are allowed; nothing looks a Business up by name. */
	@Column({ type: 'varchar', length: 255 })
	name!: string

	@Column({ type: 'varchar', length: 20, default: 'pending' })
	status!: BusinessStatus

	@Column({ type: 'uuid', nullable: true })
	ownerUserId!: string | null

	/** Optional feedback shown when a Platform Owner rejects a registration. */
	@Column({ type: 'varchar', length: 1000, nullable: true })
	rejectionReason!: string | null

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date
}
