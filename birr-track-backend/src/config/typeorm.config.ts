import { ConfigService } from '@nestjs/config'
import { TypeOrmModuleOptions } from '@nestjs/typeorm'

import { Business } from '../businesses/entities/business.entity'
import { Manager } from '../businesses/entities/manager.entity'
import { EditLog } from '../transactions/entities/edit-log.entity'
import { Transaction } from '../transactions/entities/transaction.entity'

const DEFAULT_POSTGRES_PORT = 5432
const DEFAULT_DATABASE_NAME = 'birr_track'

export function createTypeOrmConfig(configService: ConfigService): TypeOrmModuleOptions {
	return {
		type: 'postgres',
		host: configService.get<string>('DATABASE_HOST', 'localhost'),
		port: Number(configService.get<string>('DATABASE_PORT', `${DEFAULT_POSTGRES_PORT}`)),
		username: configService.get<string>('DATABASE_USER', 'postgres'),
		password: configService.get<string>('DATABASE_PASSWORD', 'postgres'),
		database: configService.get<string>('DATABASE_NAME', DEFAULT_DATABASE_NAME),
		entities: [Transaction, EditLog, Business, Manager],
		synchronize: false,
		logging: configService.get<string>('NODE_ENV') !== 'production',
	}
}
