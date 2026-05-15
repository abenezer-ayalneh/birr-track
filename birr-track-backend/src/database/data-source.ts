import 'dotenv/config'

import { DataSource } from 'typeorm'

import { Business } from '../businesses/entities/business.entity'
import { Manager } from '../businesses/entities/manager.entity'
import { EditLog } from '../transactions/entities/edit-log.entity'
import { Transaction } from '../transactions/entities/transaction.entity'

const DEFAULT_POSTGRES_PORT = 5432
const DEFAULT_DATABASE_NAME = 'birr_track'

export default new DataSource({
	type: 'postgres',
	host: process.env.DATABASE_HOST ?? 'localhost',
	port: Number(process.env.DATABASE_PORT ?? `${DEFAULT_POSTGRES_PORT}`),
	username: process.env.DATABASE_USER ?? 'postgres',
	password: process.env.DATABASE_PASSWORD ?? 'postgres',
	database: process.env.DATABASE_NAME ?? DEFAULT_DATABASE_NAME,
	entities: [Transaction, EditLog, Business, Manager],
	migrations: ['src/database/migrations/*.ts'],
	synchronize: false,
})
