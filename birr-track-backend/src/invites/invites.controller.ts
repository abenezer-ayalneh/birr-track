import { Controller, Delete, ForbiddenException, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common'

import { JwtPayload } from '../auth/auth.service'
import { AuthUserPayload } from '../auth/decorators/auth-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { InvitesService } from './invites.service'

@Controller('invites')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvitesController {
	constructor(private readonly invitesService: InvitesService) {}

	@Get()
	@Roles('manager', 'owner')
	async getPendingInvites(@AuthUserPayload() auth: JwtPayload) {
		this.validateManagerAccess(auth)
		return this.invitesService.getPendingInvitesByBusiness(auth.businessId)
	}

	@Delete(':inviteId')
	@Roles('manager', 'owner')
	async revokeInvite(@Param('inviteId', ParseUUIDPipe) inviteId: string, @AuthUserPayload() auth: JwtPayload) {
		this.validateManagerAccess(auth)
		return this.invitesService.revokeByIdAndBusiness(inviteId, auth.businessId)
	}

	private validateManagerAccess(auth: JwtPayload): void {
		if (!auth.businessId) {
			throw new ForbiddenException('User not assigned to a business')
		}
		if (auth.role !== 'manager' && auth.role !== 'owner') {
			throw new ForbiddenException('Only manager or owner can access invites')
		}
	}
}
