import { Injectable, Logger } from '@nestjs/common'
import { Context, MiddlewareFn } from 'telegraf'

import { Business } from '../../businesses/entities/business.entity'
import { User } from '../../users/entities/user.entity'
import { UsersService } from '../../users/users.service'

export interface IdentifiedContext extends Context {
	payload?: string
	state: Context['state'] & {
		user: User | null
		business: Business | null
		isPlatformOwner: boolean
		isActiveMember: boolean
	}
	session?: Record<string, unknown>
}

export function createIdentityMiddleware(usersService: UsersService): MiddlewareFn<Context> {
	const logger = new Logger(IdentityService.name)

	return async (ctx, next) => {
		await resolveIdentity(ctx as IdentifiedContext, usersService, logger)
		return next()
	}
}

@Injectable()
export class IdentityService {
	private readonly logger = new Logger(IdentityService.name)

	constructor(private readonly usersService: UsersService) {}

	async resolveIdentity(ctx: IdentifiedContext): Promise<void> {
		await resolveIdentity(ctx, this.usersService, this.logger)
	}
}

async function resolveIdentity(ctx: IdentifiedContext, usersService: UsersService, logger: Logger): Promise<void> {
	ctx.state = (ctx.state || {}) as IdentifiedContext['state']

	const telegramUserId = ctx.from?.id?.toString()

	if (!telegramUserId) {
		ctx.state.user = null
		ctx.state.business = null
		ctx.state.isPlatformOwner = false
		ctx.state.isActiveMember = false
		return
	}

	ctx.state.isPlatformOwner = usersService.isPlatformOwner(telegramUserId)

	const user = await usersService.findByTelegramId(telegramUserId)
	ctx.state.user = user || null
	ctx.state.business = user?.business || null
	ctx.state.isActiveMember = usersService.isActiveMemberOf(user, user?.businessId || '')

	logger.debug(
		`Resolved user ${telegramUserId}: user=${user?.id ?? 'null'}, business=${user?.businessId ?? 'null'}, isPlatformOwner=${ctx.state.isPlatformOwner}`,
	)
}
