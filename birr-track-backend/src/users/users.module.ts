import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AdminPanelSessionModule } from '../auth/admin-panel-session.module'
import { Invite } from '../invites/entities/invite.entity'
import { AccountController } from './account.controller'
import { User } from './entities/user.entity'
import { MembershipEventsService } from './membership-events.service'
import { StaffController } from './staff.controller'
import { UsersService } from './users.service'

@Module({
	imports: [TypeOrmModule.forFeature([User, Invite]), AdminPanelSessionModule],
	controllers: [StaffController, AccountController],
	providers: [UsersService, MembershipEventsService],
	exports: [TypeOrmModule, UsersService, MembershipEventsService],
})
export class UsersModule {}
