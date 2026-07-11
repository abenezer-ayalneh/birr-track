import { SupportedLanguage, UserRole } from '../../users/entities/user.entity'

export class AuthResponseDto {
	accessToken!: string
	sessionId!: string
	refreshToken!: string
	accessTokenExpiresAt!: number
	sessionExpiresAt!: number
	sessionIdleExpiresAt!: number
	userId!: string | null
	businessId!: string | null
	role!: UserRole | 'platform_owner'
	displayName!: string
	language!: SupportedLanguage
}
