import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { BusinessesService } from './businesses.service'
import { Business } from './entities/business.entity'

@Module({
	imports: [TypeOrmModule.forFeature([Business])],
	providers: [BusinessesService],
	exports: [BusinessesService, TypeOrmModule],
})
export class BusinessesModule {}
