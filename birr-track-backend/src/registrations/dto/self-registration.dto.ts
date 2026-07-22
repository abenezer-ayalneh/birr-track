import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'

import { SUPPORTED_LANGUAGES, SupportedLanguage } from '../../users/entities/user.entity'

export class SelfRegistrationDto {
	@IsString()
	@IsNotEmpty()
	initData!: string

	@IsString()
	@IsNotEmpty()
	@MaxLength(255)
	businessName!: string

	@IsOptional()
	@IsIn(SUPPORTED_LANGUAGES)
	language?: SupportedLanguage
}
