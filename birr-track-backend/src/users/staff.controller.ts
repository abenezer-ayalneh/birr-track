import { Controller, Delete, ForbiddenException, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'

import { JwtPayload } from '../auth/auth.service'
import { AuthUserPayload } from '../auth/decorators/auth-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { UsersService } from './users.service'

export type StaffMember = {
	id: string
	telegramUserId: string
	displayName: string
	role: string
	removedAt: Date | null
}

@Controller('staff')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffController {
	constructor(private readonly usersService: UsersService) {}

	@Get()
	@Roles('manager', 'owner')
	async getStaff(@AuthUserPayload() auth: JwtPayload) {
		this.validateManagerAccess(auth)
		return this.usersService.getBusinessStaff(auth.businessId)
	}

	@Delete(':userId')
	@Roles('manager', 'owner')
	async removeStaff(@Param('userId', ParseUUIDPipe) userId: string, @AuthUserPayload() auth: JwtPayload) {
		this.validateManagerAccess(auth)
		const actor = await this.usersService.findById(auth.userId)
		if (!actor) {
			throw new ForbiddenException('User not found')
		}
		return this.usersService.remove(actor, userId)
	}

	@Post(':userId/promote')
	@Roles('owner')
	async promoteUser(@Param('userId', ParseUUIDPipe) userId: string, @AuthUserPayload() auth: JwtPayload) {
		if (auth.role !== 'owner') {
			throw new ForbiddenException('Only the owner can promote users')
		}
		const actor = await this.usersService.findById(auth.userId)
		if (!actor) {
			throw new ForbiddenException('User not found')
		}
		return this.usersService.promoteToManager(actor, userId)
	}

	@Post(':userId/demote')
	@Roles('owner')
	async demoteUser(@Param('userId', ParseUUIDPipe) userId: string, @AuthUserPayload() auth: JwtPayload) {
		if (auth.role !== 'owner') {
			throw new ForbiddenException('Only the owner can demote users')
		}
		const actor = await this.usersService.findById(auth.userId)
		if (!actor) {
			throw new ForbiddenException('User not found')
		}
		return this.usersService.demoteToWaiter(actor, userId)
	}

	private validateManagerAccess(auth: JwtPayload): void {
		if (!auth.businessId) {
			throw new ForbiddenException('User not assigned to a business')
		}
		if (auth.role !== 'manager' && auth.role !== 'owner') {
			throw new ForbiddenException('Only manager or owner can access staff management')
		}
	}
}
