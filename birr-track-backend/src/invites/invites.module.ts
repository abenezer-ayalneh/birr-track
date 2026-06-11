import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { UsersModule } from '../users/users.module'
import { Invite } from './entities/invite.entity'
import { InvitesService } from './invites.service'

@Module({
	imports: [TypeOrmModule.forFeature([Invite]), UsersModule],
	providers: [InvitesService],
	exports: [TypeOrmModule, InvitesService],
})
export class InvitesModule {}
