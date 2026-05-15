import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { PrismaClientKnownRequestError, PrismaClientValidationError } from '@prisma/client/runtime/client'
import { Response } from 'express'

import ValidationException from '../exceptions/validation.exception'
import FilterResponseInterface from './interfaces/filter-response.interface'

/**
 * Catch every exception and handle it here
 * and return a consistent error message
 */
@Catch()
export default class GlobalExceptionFilter implements ExceptionFilter {
	constructor(private readonly logger: Logger) {}

	catch(exception: unknown, host: ArgumentsHost) {
		const contextType = host.getType()
		let stack = null

		// Create the default response data structure
		const responseData: FilterResponseInterface = {
			statusCode: 500,
			errorType: 'Server Error',
			message: 'Internal server error',
		}

		if (exception instanceof ValidationException) {
			responseData.statusCode = exception.getStatusCode
			responseData.errorType = exception.getError
			responseData.message = typeof exception.getMessage === 'string' ? exception.getMessage : exception.getError
			responseData.details = exception.getMessage
			stack = exception
		} else if (exception instanceof HttpException) {
			responseData.statusCode = exception.getStatus()
			responseData.errorType = 'HTTP Error'
			responseData.message = exception.message
			responseData.details = exception.getResponse()
			stack = exception.stack
		} else if (exception instanceof PrismaClientValidationError || exception instanceof PrismaClientKnownRequestError) {
			responseData.statusCode = HttpStatus.INTERNAL_SERVER_ERROR
			responseData.errorType = 'Database Error'
			responseData.message = exception.message
			responseData.details = exception.message
			stack = exception.stack
		}

		// Log the error before responding
		if (exception instanceof Error) {
			this.logger.error({ exception: { name: exception.name, message: exception.message } }, exception.stack)
		} else {
			this.logger.error({ exception }, stack)
		}

		// Telegram/Telegraf updates and other non-HTTP contexts do not expose
		// an Express/Fastify response object, so we only build an HTTP response
		// when the current execution context is actually HTTP.
		if (contextType !== 'http') {
			return
		}

		const ctx = host.switchToHttp()
		const response = ctx.getResponse<Response>()
		response.status(responseData.statusCode).json(responseData)
	}
}
