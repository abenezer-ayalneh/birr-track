import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { Business } from './entities/business.entity'
import { Manager } from './entities/manager.entity'

@Module({
	imports: [TypeOrmModule.forFeature([Business, Manager])],
	exports: [TypeOrmModule],
})
export class BusinessesModule {}
