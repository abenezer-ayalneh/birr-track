import { Body, Controller, Post } from '@nestjs/common'

import { PublicRoute } from '../auth/decorators/public-route.decorator'
import { PreflightTelegramDto } from './dto/preflight-telegram.dto'
import { SelfRegistrationDto } from './dto/self-registration.dto'
import { RegistrationsService } from './registrations.service'

/** Signed Telegram entry endpoints used before a normal Admin Panel session exists. */
@Controller('registrations')
export class PublicRegistrationsController {
	constructor(private readonly registrationsService: RegistrationsService) {}

	@Post('preflight')
	@PublicRoute()
	preflight(@Body() dto: PreflightTelegramDto) {
		return this.registrationsService.getEntryState(dto.initData)
	}

	@Post('self')
	@PublicRoute()
	register(@Body() dto: SelfRegistrationDto) {
		return this.registrationsService.submitSelfRegistration(dto.initData, dto.businessName, dto.language)
	}
}
