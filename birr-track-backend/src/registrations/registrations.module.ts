import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AdminPanelSessionModule } from '../auth/admin-panel-session.module'
import { AuthModule } from '../auth/auth.module'
import { Business } from '../businesses/entities/business.entity'
import { InvitesModule } from '../invites/invites.module'
import { TelegramPresentationModule } from '../telegram/telegram-presentation.module'
import { User } from '../users/entities/user.entity'
import { UsersModule } from '../users/users.module'
import { PublicRegistrationsController } from './public-registrations.controller'
import { RegistrationsController } from './registrations.controller'
import { RegistrationsService } from './registrations.service'

@Module({
	imports: [TypeOrmModule.forFeature([Business, User]), AdminPanelSessionModule, AuthModule, InvitesModule, UsersModule, TelegramPresentationModule],
	controllers: [RegistrationsController, PublicRegistrationsController],
	providers: [RegistrationsService],
	exports: [RegistrationsService],
})
export class RegistrationsModule {}
