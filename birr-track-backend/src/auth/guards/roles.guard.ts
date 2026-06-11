import '../types/express-request'

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Request } from 'express'

import { ROLES_KEY } from '../decorators/roles.decorator'

@Injectable()
export class RolesGuard implements CanActivate {
	constructor(private reflector: Reflector) {}

	canActivate(context: ExecutionContext): boolean {
		const requiredRoles = this.reflector.get<string[]>(ROLES_KEY, context.getHandler())

		// If no roles are specified, allow access
		if (!requiredRoles) {
			return true
		}

		const request = context.switchToHttp().getRequest<Request>()
		const payload = request.authPayload

		if (!payload) {
			return false
		}

		return requiredRoles.includes(payload.role)
	}
}
