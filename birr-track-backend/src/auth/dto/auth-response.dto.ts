import { UserRole } from '../../users/entities/user.entity'

export class AuthResponseDto {
	accessToken!: string
	userId!: string | null
	businessId!: string | null
	role!: UserRole | 'platform_owner'
	displayName!: string
}
