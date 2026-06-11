import { Injectable, Logger } from '@nestjs/common'
import { Context } from 'telegraf'

import { Business } from '../../businesses/entities/business.entity'
import { User } from '../../users/entities/user.entity'
import { UsersService } from '../../users/users.service'

export interface IdentifiedContext extends Context {
	state: Context['state'] & {
		user: User | null
		business: Business | null
		isPlatformOwner: boolean
		isActiveMember: boolean
	}
	session?: Record<string, unknown>
}

@Injectable()
export class IdentityService {
	private readonly logger = new Logger(IdentityService.name)

	constructor(private readonly usersService: UsersService) {}

	async resolveIdentity(ctx: IdentifiedContext): Promise<void> {
		const telegramUserId = ctx.from?.id?.toString()

		if (!telegramUserId) {
			ctx.state.user = null
			ctx.state.business = null
			ctx.state.isPlatformOwner = false
			ctx.state.isActiveMember = false
			return
		}

		ctx.state.isPlatformOwner = this.usersService.isPlatformOwner(telegramUserId)

		const user = await this.usersService.findByTelegramId(telegramUserId)
		ctx.state.user = user || null
		ctx.state.business = user?.business || null
		ctx.state.isActiveMember = this.usersService.isActiveMemberOf(user, user?.businessId || '')

		this.logger.debug(
			`Resolved user ${telegramUserId}: user=${user?.id ?? 'null'}, business=${user?.businessId ?? 'null'}, isPlatformOwner=${ctx.state.isPlatformOwner}`,
		)
	}
}
