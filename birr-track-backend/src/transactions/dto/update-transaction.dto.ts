import { IsDateString, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator'

export class UpdateTransactionDto {
	@IsOptional()
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	amount?: number

	@IsOptional()
	@IsString()
	@Length(1, 128)
	transactionId?: string

	@IsOptional()
	@IsDateString()
	timestamp?: string

	@IsOptional()
	@IsString()
	@Length(1, 120)
	bankName?: string

	@IsOptional()
	@IsNumber()
	@Min(0)
	@Max(1)
	confidence?: number

	@IsOptional()
	@IsString()
	imageUrl?: string
}
