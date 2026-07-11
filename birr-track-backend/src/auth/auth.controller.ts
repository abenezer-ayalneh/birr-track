import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common'

import { UsersService } from '../users/users.service'
import { AuthService } from './auth.service'
import { JwtPayload } from './auth.service'
import { AuthUserPayload } from './decorators/auth-user.decorator'
import { AuthResponseDto } from './dto/auth-response.dto'
import { RefreshAuthDto } from './dto/refresh-auth.dto'
import { TelegramAuthDto } from './dto/telegram-auth.dto'
import { UpdateLanguageDto } from './dto/update-language.dto'

@Controller('auth')
export class AuthController {
	constructor(
		private readonly authService: AuthService,
		private readonly usersService: UsersService,
	) {}

	@Post('telegram')
	async authenticateTelegram(@Body() dto: TelegramAuthDto): Promise<AuthResponseDto> {
		const { response } = await this.authService.authenticateFromInitData(dto.initData)
		return response
	}

	@Post('refresh')
	async refresh(@Body() dto: RefreshAuthDto): Promise<AuthResponseDto> {
		const { response } = await this.authService.refreshAdminPanelSession(dto)
		return response
	}

	@Post('logout')
	@HttpCode(204)
	async logout(@Body() dto: RefreshAuthDto): Promise<void> {
		await this.authService.logout(dto)
	}

	@Get('me')
	getMe(@AuthUserPayload() payload: JwtPayload): { user: JwtPayload } {
		return { user: payload }
	}

	@Patch('language')
	async updateLanguage(@AuthUserPayload() payload: JwtPayload, @Body() dto: UpdateLanguageDto): Promise<{ language: string }> {
		if (!payload.userId) {
			return { language: dto.language }
		}
		const user = await this.usersService.updateLanguage(payload.userId, dto.language)
		return { language: user.language }
	}
}
