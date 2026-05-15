import { IsBoolean, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator'

export class CreateTransactionDto {
	@IsString()
	@IsNotEmpty()
	telegramUserId!: string

	@IsString()
	@IsNotEmpty()
	@Length(1, 255)
	telegramName!: string

	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	amount!: number

	@IsString()
	@IsNotEmpty()
	@Length(1, 128)
	transactionId!: string

	@IsDateString()
	timestamp!: string

	@IsString()
	@IsNotEmpty()
	@Length(1, 120)
	bankName!: string

	@IsNumber()
	@Min(0)
	@Max(1)
	confidence!: number

	@IsBoolean()
	isDuplicate!: boolean

	@IsOptional()
	@IsString()
	imageUrl?: string
}
