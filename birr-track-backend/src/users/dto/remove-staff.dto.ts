import { IsOptional, IsString, MaxLength } from 'class-validator'

export class RemoveStaffDto {
	@IsOptional()
	@IsString()
	@MaxLength(500)
	reason?: string
}
