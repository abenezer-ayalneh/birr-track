/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { createHmac } from 'crypto'

import { User } from '../users/entities/user.entity'
import { UsersService } from '../users/users.service'
import { AuthService } from './auth.service'

describe('AuthService', () => {
	let service: AuthService
	let usersService: UsersService

	const mockBotToken = 'test-bot-token-12345'
	const mockJwtSecret = 'test-jwt-secret-key'
	const mockPlatformOwnerId = '999999999'

	const mockUser: User = {
		id: 'user-1',
		telegramUserId: '123456789',
		displayName: 'Test User',
		businessId: 'business-1',
		role: 'waiter' as const,
		removedAt: null,
		createdAt: new Date(),
		business: null,
	}

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AuthService,
				{
					provide: UsersService,
					useValue: {
						isPlatformOwner: jest.fn(),
						findByTelegramId: jest.fn(),
					},
				},
				{
					provide: ConfigService,
					useValue: {
						get: jest.fn((key: string) => {
							const config: Record<string, string> = {
								TELEGRAM_BOT_TOKEN: mockBotToken,
								JWT_SECRET: mockJwtSecret,
								PLATFORM_OWNER_TELEGRAM_ID: mockPlatformOwnerId,
							}
							return config[key]
						}),
					},
				},
			],
		}).compile()

		service = module.get<AuthService>(AuthService)
		usersService = module.get<UsersService>(UsersService)
	})

	describe('validateInitData', () => {
		it('should validate correct initData with valid signature', () => {
			// Create valid initData
			const authDate = Math.floor(Date.now() / 1000)
			const user = { id: '123456789' }
			const params = new URLSearchParams({
				user: JSON.stringify(user),
				auth_date: authDate.toString(),
			})

			// Calculate hash
			const dataCheckString = `auth_date=${authDate}\nuser=${JSON.stringify(user)}`
			const secretKey = createHmac('sha256', 'WebAppData').update(mockBotToken).digest()
			const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

			params.append('hash', hash)
			const initData = params.toString()

			const result = service.validateInitData(initData)

			expect(result.telegramUserId).toBe('123456789')
			expect(result.auth_date).toBe(authDate)
			expect(result.hash).toBe(hash)
		})

		it('should throw on invalid hash', () => {
			const authDate = Math.floor(Date.now() / 1000)
			const user = { id: '123456789' }
			const initData = new URLSearchParams({
				user: JSON.stringify(user),
				auth_date: authDate.toString(),
				hash: 'invalid-hash-value',
			}).toString()

			expect(() => service.validateInitData(initData)).toThrow(UnauthorizedException)
		})

		it('should throw on missing hash', () => {
			const authDate = Math.floor(Date.now() / 1000)
			const user = { id: '123456789' }
			const initData = new URLSearchParams({
				user: JSON.stringify(user),
				auth_date: authDate.toString(),
			}).toString()

			expect(() => service.validateInitData(initData)).toThrow(UnauthorizedException)
		})

		it('should throw on expired initData', () => {
			// Create expired initData (600 seconds old)
			const authDate = Math.floor(Date.now() / 1000) - 600
			const user = { id: '123456789' }
			const params = new URLSearchParams({
				user: JSON.stringify(user),
				auth_date: authDate.toString(),
			})

			const dataCheckString = `auth_date=${authDate}\nuser=${JSON.stringify(user)}`
			const secretKey = createHmac('sha256', 'WebAppData').update(mockBotToken).digest()
			const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

			params.append('hash', hash)
			const initData = params.toString()

			expect(() => service.validateInitData(initData)).toThrow(UnauthorizedException)
		})

		it('should throw on missing user', () => {
			const authDate = Math.floor(Date.now() / 1000)
			const params = new URLSearchParams({
				auth_date: authDate.toString(),
				hash: 'some-hash',
			})

			expect(() => service.validateInitData(params.toString())).toThrow(UnauthorizedException)
		})

		it('should throw on missing auth_date', () => {
			const user = { id: '123456789' }
			const params = new URLSearchParams({
				user: JSON.stringify(user),
				hash: 'some-hash',
			})

			expect(() => service.validateInitData(params.toString())).toThrow(UnauthorizedException)
		})
	})

	describe('authenticateFromInitData', () => {
		it('should authenticate platform owner', async () => {
			const authDate = Math.floor(Date.now() / 1000)
			const user = { id: mockPlatformOwnerId }
			const params = new URLSearchParams({
				user: JSON.stringify(user),
				auth_date: authDate.toString(),
			})

			const dataCheckString = `auth_date=${authDate}\nuser=${JSON.stringify(user)}`
			const secretKey = createHmac('sha256', 'WebAppData').update(mockBotToken).digest()
			const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

			params.append('hash', hash)
			const initData = params.toString()

			const result = await service.authenticateFromInitData(initData)

			expect(result.response.role).toBe('platform_owner')
			expect(result.response.userId).toBeNull()
			expect(result.payload.role).toBe('platform_owner')
			expect(result.payload.telegramUserId).toBe(mockPlatformOwnerId)
		})

		it('should authenticate regular user', async () => {
			const authDate = Math.floor(Date.now() / 1000)
			const user = { id: '123456789' }
			const params = new URLSearchParams({
				user: JSON.stringify(user),
				auth_date: authDate.toString(),
			})

			const dataCheckString = `auth_date=${authDate}\nuser=${JSON.stringify(user)}`
			const secretKey = createHmac('sha256', 'WebAppData').update(mockBotToken).digest()
			const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

			params.append('hash', hash)
			const initData = params.toString()

			jest.spyOn(usersService, 'isPlatformOwner').mockReturnValue(false)
			jest.spyOn(usersService, 'findByTelegramId').mockResolvedValue(mockUser)

			const result = await service.authenticateFromInitData(initData)

			expect(result.response.role).toBe('waiter')
			expect(result.response.userId).toBe('user-1')
			expect(result.response.businessId).toBe('business-1')
			expect(result.response.displayName).toBe('Test User')
		})

		it('should throw when regular user not found', async () => {
			const authDate = Math.floor(Date.now() / 1000)
			const user = { id: '123456789' }
			const params = new URLSearchParams({
				user: JSON.stringify(user),
				auth_date: authDate.toString(),
			})

			const dataCheckString = `auth_date=${authDate}\nuser=${JSON.stringify(user)}`
			const secretKey = createHmac('sha256', 'WebAppData').update(mockBotToken).digest()
			const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

			params.append('hash', hash)
			const initData = params.toString()

			jest.spyOn(usersService, 'isPlatformOwner').mockReturnValue(false)
			jest.spyOn(usersService, 'findByTelegramId').mockResolvedValue(null)

			await expect(service.authenticateFromInitData(initData)).rejects.toThrow(UnauthorizedException)
		})
	})
})
