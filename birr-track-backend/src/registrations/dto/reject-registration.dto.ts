import { IsOptional, IsString, MaxLength } from 'class-validator'

export class RejectRegistrationDto {
	@IsOptional()
	@IsString()
	@MaxLength(1000)
	reason?: string
}
