import { ConfigService } from '@nestjs/config'

import { TelegramLinksService } from './telegram-links.service'

describe('TelegramLinksService', () => {
	function buildService(values: Record<string, string | undefined>): TelegramLinksService {
		const configService = {
			get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
		} as unknown as ConfigService
		return new TelegramLinksService(configService)
	}

	it('exposes the configured Mini App and support URLs', () => {
		const service = buildService({
			FRONTEND_APP_URL: 'https://app.example.com',
			TELEGRAM_SUPPORT_URL: 'https://t.me/birr_track_support',
		})

		expect(service.getMiniAppUrl()).toBe('https://app.example.com')
		expect(service.getSupportUrl()).toBe('https://t.me/birr_track_support')
		expect(() => service.onModuleInit()).not.toThrow()
	})

	it('rejects a missing support URL during startup', () => {
		const service = buildService({})

		expect(() => service.onModuleInit()).toThrow('TELEGRAM_SUPPORT_URL is required')
	})

	it.each(['http://t.me/birr_track_support', 'not-a-url'])('rejects an invalid support URL: %s', (supportUrl) => {
		const service = buildService({ TELEGRAM_SUPPORT_URL: supportUrl })

		expect(() => service.onModuleInit()).toThrow('TELEGRAM_SUPPORT_URL must be a valid HTTPS URL')
	})
})
