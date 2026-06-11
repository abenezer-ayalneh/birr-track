import { ConflictException, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'

import { JwtPayload } from '../auth/auth.service'
import { AuthUserPayload } from '../auth/decorators/auth-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BusinessesService } from './businesses.service'

@Controller('businesses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BusinessesController {
	constructor(private readonly businessesService: BusinessesService) {}

	@Get()
	@Roles('platform_owner')
	async getBusinesses(@AuthUserPayload() auth: JwtPayload) {
		if (auth.role !== 'platform_owner') {
			throw new ConflictException('Only platform owner can access businesses')
		}
		return this.businessesService.getAllBusinesses()
	}

	@Post(':businessId/suspend')
	@Roles('platform_owner')
	async suspendBusiness(@Param('businessId', ParseUUIDPipe) businessId: string, @AuthUserPayload() auth: JwtPayload) {
		if (auth.role !== 'platform_owner') {
			throw new ConflictException('Only platform owner can suspend businesses')
		}
		return this.businessesService.suspendBusiness(businessId)
	}

	@Post(':businessId/unsuspend')
	@Roles('platform_owner')
	async unsuspendBusiness(@Param('businessId', ParseUUIDPipe) businessId: string, @AuthUserPayload() auth: JwtPayload) {
		if (auth.role !== 'platform_owner') {
			throw new ConflictException('Only platform owner can unsuspend businesses')
		}
		return this.businessesService.unsuspendBusiness(businessId)
	}
}
