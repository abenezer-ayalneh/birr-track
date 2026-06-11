import { IsBoolean, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator'

export class CreateTransactionDto {
	@IsString()
	@IsNotEmpty()
	telegramUserId!: string

	@IsString()
	@IsNotEmpty()
	@Length(1, 255)
	telegramName!: string

	@IsOptional()
	@IsUUID()
	businessId?: string

	@IsOptional()
	@IsUUID()
	userId?: string

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

	@IsNumber()
	@Min(0)
	@Max(1)
	confidence!: number

	@IsBoolean()
	isDuplicate!: boolean

	@IsOptional()
	@IsString()
	imageKey?: string

	@IsOptional()
	@IsString()
	fileUniqueId?: string
}
