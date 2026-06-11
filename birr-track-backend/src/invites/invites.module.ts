import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { UsersModule } from '../users/users.module'
import { Invite } from './entities/invite.entity'
import { InvitesController } from './invites.controller'
import { InvitesService } from './invites.service'

@Module({
	imports: [TypeOrmModule.forFeature([Invite]), UsersModule],
	controllers: [InvitesController],
	providers: [InvitesService],
	exports: [TypeOrmModule, InvitesService],
})
export class InvitesModule {}
