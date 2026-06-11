import { UnauthorizedException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getBotToken } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'

import { TELEGRAM_BOT_NAME } from './telegram.constants'
import { TelegramController } from './telegram.controller'

describe('TelegramController', () => {
	let controller: TelegramController
	let mockTelegrafBot: { handleUpdate: jest.Mock }

	beforeEach(async () => {
		mockTelegrafBot = { handleUpdate: jest.fn() }

		const mockConfigService = {
			get: jest.fn((key: string) => {
				if (key === 'TELEGRAM_WEBHOOK_SECRET') {
					return 'my-secret'
				}
				return undefined
			}),
		}

		const module: TestingModule = await Test.createTestingModule({
			controllers: [TelegramController],
		})
			.useMocker((token) => {
				if (token === getBotToken(TELEGRAM_BOT_NAME)) {
					return mockTelegrafBot as unknown as Telegraf
				}
				if (token && typeof token === 'function' && token.name === 'ConfigService') {
					return mockConfigService
				}
				return undefined
			})
			.compile()

		controller = module.get<TelegramController>(TelegramController)
	})

	describe('handleWebhook', () => {
		it('should accept valid secret token', async () => {
			const result = await controller.handleWebhook('my-secret', { message: { text: 'test' } } as any)
			expect(result.ok).toBe(true)
			expect(mockTelegrafBot.handleUpdate).toHaveBeenCalled()
		})

		it('should reject missing secret token', async () => {
			await expect(controller.handleWebhook(undefined, { message: { text: 'test' } } as any)).rejects.toThrow(UnauthorizedException)
		})

		it('should reject mismatched secret token', async () => {
			await expect(controller.handleWebhook('wrong-secret', { message: { text: 'test' } } as any)).rejects.toThrow(UnauthorizedException)
		})
	})
})
