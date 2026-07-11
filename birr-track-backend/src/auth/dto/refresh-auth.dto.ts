import { IsNotEmpty, IsString } from 'class-validator'

export class RefreshAuthDto {
	@IsString()
	@IsNotEmpty()
	sessionId!: string

	@IsString()
	@IsNotEmpty()
	refreshToken!: string
}
