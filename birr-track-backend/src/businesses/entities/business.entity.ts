import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm'

import { Manager } from './manager.entity'

@Entity('businesses')
export class Business {
	@PrimaryGeneratedColumn('uuid')
	id!: string

	@Column({ type: 'varchar', length: 255, unique: true })
	name!: string

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date

	@OneToMany(() => Manager, (manager) => manager.business)
	managers!: Manager[]
}
