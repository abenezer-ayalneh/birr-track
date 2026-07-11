import { Module } from '@nestjs/common'

import { UsersModule } from '../users/users.module'
import { AdminPanelSessionService } from './admin-panel-session.service'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'

@Module({
	imports: [UsersModule],
	controllers: [AuthController],
	providers: [AdminPanelSessionService, AuthService],
	exports: [AdminPanelSessionService, AuthService],
})
export class AuthModule {}
