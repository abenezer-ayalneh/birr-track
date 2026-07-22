import { IsNotEmpty, IsString } from 'class-validator'

export class PreflightTelegramDto {
	@IsString()
	@IsNotEmpty()
	initData!: string
}
