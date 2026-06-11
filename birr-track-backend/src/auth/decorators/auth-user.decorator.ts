import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { Request } from 'express'

import { JwtPayload } from '../auth.service'

declare global {
	namespace Express {
		interface Request {
			authPayload?: JwtPayload
		}
	}
}

export const AuthUserPayload = createParamDecorator((data: unknown, ctx: ExecutionContext): JwtPayload => {
	const request = ctx.switchToHttp().getRequest<Request>()
	return request.authPayload
})
