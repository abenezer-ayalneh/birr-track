import '../types/express-request'

import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { Request } from 'express'

import { JwtPayload } from '../auth.service'

export const AuthUserPayload = createParamDecorator((data: unknown, ctx: ExecutionContext): JwtPayload => {
	const request = ctx.switchToHttp().getRequest<Request>()
	return (request as any).authPayload as JwtPayload
})
