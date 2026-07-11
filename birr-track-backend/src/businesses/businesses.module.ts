import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AdminPanelSessionModule } from '../auth/admin-panel-session.module'
import { BusinessesController } from './businesses.controller'
import { BusinessesService } from './businesses.service'
import { Business } from './entities/business.entity'

@Module({
	imports: [TypeOrmModule.forFeature([Business]), AdminPanelSessionModule],
	controllers: [BusinessesController],
	providers: [BusinessesService],
	exports: [BusinessesService, TypeOrmModule],
})
export class BusinessesModule {}
