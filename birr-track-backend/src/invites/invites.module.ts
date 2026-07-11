import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AdminPanelSessionModule } from '../auth/admin-panel-session.module'
import { UsersModule } from '../users/users.module'
import { Invite } from './entities/invite.entity'
import { InvitesController } from './invites.controller'
import { InvitesService } from './invites.service'

@Module({
	imports: [TypeOrmModule.forFeature([Invite]), UsersModule, AdminPanelSessionModule],
	controllers: [InvitesController],
	providers: [InvitesService],
	exports: [TypeOrmModule, InvitesService],
})
export class InvitesModule {}
