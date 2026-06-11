import { ConflictException, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'

import { JwtPayload } from '../auth/auth.service'
import { AuthUserPayload } from '../auth/decorators/auth-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { RegistrationsService } from './registrations.service'

@Controller('registrations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RegistrationsController {
	constructor(private readonly registrationsService: RegistrationsService) {}

	@Get()
	@Roles('platform_owner')
	getPending(@AuthUserPayload() auth: JwtPayload) {
		if (auth.role !== 'platform_owner') {
			throw new ConflictException('Only platform owner can access registrations')
		}
		return this.registrationsService.getPendingRegistrations()
	}

	@Post(':businessId/approve')
	@Roles('platform_owner')
	async approveBusiness(@Param('businessId', ParseUUIDPipe) businessId: string, @AuthUserPayload() auth: JwtPayload) {
		if (auth.role !== 'platform_owner') {
			throw new ConflictException('Only platform owner can approve registrations')
		}
		const { status, message } = await this.registrationsService.approveBusiness(businessId)
		return { status, message }
	}

	@Post(':businessId/reject')
	@Roles('platform_owner')
	async rejectBusiness(@Param('businessId', ParseUUIDPipe) businessId: string, @AuthUserPayload() auth: JwtPayload) {
		if (auth.role !== 'platform_owner') {
			throw new ConflictException('Only platform owner can reject registrations')
		}
		const { status, message } = await this.registrationsService.rejectBusiness(businessId)
		return { status, message }
	}
}
