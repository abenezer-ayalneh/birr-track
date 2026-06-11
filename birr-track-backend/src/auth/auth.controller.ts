import { Body, Controller, Get, Post } from '@nestjs/common'

import { AuthService } from './auth.service'
import { JwtPayload } from './auth.service'
import { AuthUserPayload } from './decorators/auth-user.decorator'
import { AuthResponseDto } from './dto/auth-response.dto'
import { TelegramAuthDto } from './dto/telegram-auth.dto'

@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Post('telegram')
	async authenticateTelegram(@Body() dto: TelegramAuthDto): Promise<AuthResponseDto> {
		const { response } = await this.authService.authenticateFromInitData(dto.initData)
		return response
	}

	@Get('me')
	getMe(@AuthUserPayload() payload: JwtPayload): { user: JwtPayload } {
		return { user: payload }
	}
}
