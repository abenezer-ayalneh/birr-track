import { Controller, Delete, ForbiddenException, Get, HttpCode } from '@nestjs/common'

import { JwtPayload } from '../auth/auth.service'
import { AuthUserPayload } from '../auth/decorators/auth-user.decorator'
import { UsersService } from './users.service'

@Controller('account')
export class AccountController {
	constructor(private readonly usersService: UsersService) {}

	@Get()
	async getAccount(@AuthUserPayload() auth: JwtPayload) {
		if (!auth.userId || auth.role === 'platform_owner') {
			throw new ForbiddenException('Platform owner does not have a business membership')
		}
		return this.usersService.getAccount(auth.userId)
	}

	@Delete('membership')
	@HttpCode(204)
	async leaveBusiness(@AuthUserPayload() auth: JwtPayload): Promise<void> {
		if (!auth.userId || auth.role === 'platform_owner') {
			throw new ForbiddenException('Platform owner does not have a business membership')
		}
		await this.usersService.leaveBusiness(auth.userId)
	}
}
