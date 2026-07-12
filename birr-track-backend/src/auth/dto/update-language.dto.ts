import { IsIn } from 'class-validator'

import { SupportedLanguage, SUPPORTED_LANGUAGES } from '../../users/entities/user.entity'

export class UpdateLanguageDto {
	@IsIn(SUPPORTED_LANGUAGES)
	language!: SupportedLanguage
}
