import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { AdminPanelSessionService } from './admin-panel-session.service'

@Module({
	imports: [ConfigModule],
	providers: [AdminPanelSessionService],
	exports: [AdminPanelSessionService],
})
export class AdminPanelSessionModule {}
