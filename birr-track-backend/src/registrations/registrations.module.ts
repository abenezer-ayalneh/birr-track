import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { Business } from '../businesses/entities/business.entity'
import { User } from '../users/entities/user.entity'
import { RegistrationsController } from './registrations.controller'
import { RegistrationsService } from './registrations.service'

@Module({
	imports: [TypeOrmModule.forFeature([Business, User])],
	controllers: [RegistrationsController],
	providers: [RegistrationsService],
	exports: [RegistrationsService],
})
export class RegistrationsModule {}
