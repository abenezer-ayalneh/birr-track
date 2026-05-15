import { HttpStatus } from '@nestjs/common'
import { ValidationError } from 'class-validator'

export default class ValidationException {
	private readonly error: string

	private readonly message: string | object

	private readonly statusCode: number

	constructor(validationErrors: ValidationError[]) {
		this.error = 'Validation Error'
		this.message = validationErrors.map((error) => ({
			field: error.property,
			errors: error.constraints,
		}))
		this.statusCode = HttpStatus.UNPROCESSABLE_ENTITY
	}

	get getError(): string {
		return this.error
	}

	get getMessage(): string | object {
		return this.message
	}

	get getStatusCode(): number {
		return this.statusCode
	}
}
