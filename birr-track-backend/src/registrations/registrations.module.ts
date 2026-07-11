import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AdminPanelSessionModule } from '../auth/admin-panel-session.module'
import { Business } from '../businesses/entities/business.entity'
import { User } from '../users/entities/user.entity'
import { RegistrationsController } from './registrations.controller'
import { RegistrationsService } from './registrations.service'

@Module({
	imports: [TypeOrmModule.forFeature([Business, User]), AdminPanelSessionModule],
	controllers: [RegistrationsController],
	providers: [RegistrationsService],
	exports: [RegistrationsService],
})
export class RegistrationsModule {}
