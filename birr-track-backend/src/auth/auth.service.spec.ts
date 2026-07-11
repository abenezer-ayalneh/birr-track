import { UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { createHmac } from 'crypto'

import { User } from '../users/entities/user.entity'
import { UsersService } from '../users/users.service'
import { AdminPanelSessionService } from './admin-panel-session.service'
import { AuthService } from './auth.service'

describe('AuthService', () => {
	let service: AuthService
	let usersService: UsersService
	let adminPanelSessions: AdminPanelSessionService

	const mockBotToken = 'test-bot-token-12345'
	const mockJwtSecret = 'test-jwt-secret-key'
	const mockPlatformOwnerId = '999999999'

	const mockUser: User = {
		id: 'user-1',
		telegramUserId: '123456789',
		displayName: 'Test User',
		businessId: 'business-1',
		role: 'waiter' as const,
		language: 'en',
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
				{
					provide: AdminPanelSessionService,
					useValue: {
						create: jest.fn().mockResolvedValue({
							sessionId: 'session-1',
							refreshToken: 'refresh-1',
							expiresAt: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
							idleExpiresAt: Math.floor(Date.now() / 1000) + 30 * 60,
							accessTokenExpiresInSeconds: 15 * 60,
						}),
						renew: jest.fn().mockResolvedValue({
							record: {
								sessionId: 'session-1',
								refreshTokenHash: 'hash',
								payload: {
									userId: 'user-1',
									businessId: 'business-1',
									role: 'waiter',
									telegramUserId: '123456789',
									sessionId: 'session-1',
								},
								createdAt: Math.floor(Date.now() / 1000),
								lastRenewedAt: Math.floor(Date.now() / 1000),
								expiresAt: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
								idleExpiresAt: Math.floor(Date.now() / 1000) + 30 * 60,
							},
							expiresAt: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
							idleExpiresAt: Math.floor(Date.now() / 1000) + 30 * 60,
							accessTokenExpiresInSeconds: 15 * 60,
						}),
						revoke: jest.fn(),
						getAccessTokenTtlSeconds: jest.fn().mockReturnValue(15 * 60),
					},
				},
			],
		}).compile()

		service = module.get<AuthService>(AuthService)
		usersService = module.get<UsersService>(UsersService)
		adminPanelSessions = module.get<AdminPanelSessionService>(AdminPanelSessionService)
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

			jest.spyOn(usersService, 'isPlatformOwner').mockReturnValue(true)

			const result = await service.authenticateFromInitData(initData)

			expect(result.response.role).toBe('platform_owner')
			expect(result.response.userId).toBeNull()
			expect(result.response.sessionId).toBe('session-1')
			expect(result.response.refreshToken).toBe('refresh-1')
			expect(result.payload.role).toBe('platform_owner')
			expect(result.payload.sessionId).toBe('session-1')
			expect(result.payload.telegramUserId).toBe(mockPlatformOwnerId)
			expect(adminPanelSessions.create).toHaveBeenCalledWith(
				expect.objectContaining({ role: 'platform_owner', telegramUserId: mockPlatformOwnerId }),
			)
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
			expect(result.response.sessionId).toBe('session-1')
			expect(result.response.refreshToken).toBe('refresh-1')
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

	describe('refreshAdminPanelSession', () => {
		it('should renew an Admin Panel Session without revalidating Telegram initData', async () => {
			jest.spyOn(usersService, 'findByTelegramId').mockResolvedValue(mockUser)

			const result = await service.refreshAdminPanelSession({ sessionId: 'session-1', refreshToken: 'refresh-1' })

			expect(adminPanelSessions.renew).toHaveBeenCalledWith('session-1', 'refresh-1')
			expect(result.response.accessToken).toBeTruthy()
			expect(result.response.sessionId).toBe('session-1')
			expect(result.response.refreshToken).toBe('refresh-1')
			expect(result.response.role).toBe('waiter')
			expect(result.response.displayName).toBe('Test User')
			expect(result.payload.sessionId).toBe('session-1')
		})

		it('should revoke an Admin Panel Session on logout', async () => {
			await service.logout({ sessionId: 'session-1', refreshToken: 'refresh-1' })

			expect(adminPanelSessions.revoke).toHaveBeenCalledWith('session-1')
		})
	})
})
