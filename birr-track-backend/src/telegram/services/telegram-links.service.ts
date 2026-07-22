import { Injectable, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

const DEFAULT_MINI_APP_URL = 'http://localhost:3003'

@Injectable()
export class TelegramLinksService implements OnModuleInit {
	constructor(private readonly configService: ConfigService) {}

	onModuleInit(): void {
		this.getSupportUrl()
	}

	getMiniAppUrl(): string {
		return this.configService.get<string>('FRONTEND_APP_URL', DEFAULT_MINI_APP_URL).trim()
	}

	getSupportUrl(): string {
		const configured = this.configService.get<string>('TELEGRAM_SUPPORT_URL')?.trim()
		if (!configured) {
			throw new Error('TELEGRAM_SUPPORT_URL is required')
		}

		let url: URL
		try {
			url = new URL(configured)
		} catch {
			throw new Error('TELEGRAM_SUPPORT_URL must be a valid HTTPS URL')
		}

		if (url.protocol !== 'https:') {
			throw new Error('TELEGRAM_SUPPORT_URL must be a valid HTTPS URL')
		}

		return url.toString()
	}
}
