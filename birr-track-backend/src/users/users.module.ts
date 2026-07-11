import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AdminPanelSessionModule } from '../auth/admin-panel-session.module'
import { User } from './entities/user.entity'
import { StaffController } from './staff.controller'
import { UsersService } from './users.service'

@Module({
	imports: [TypeOrmModule.forFeature([User]), AdminPanelSessionModule],
	controllers: [StaffController],
	providers: [UsersService],
	exports: [TypeOrmModule, UsersService],
})
export class UsersModule {}
