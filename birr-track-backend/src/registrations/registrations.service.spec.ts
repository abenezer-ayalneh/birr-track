/* eslint-disable @typescript-eslint/unbound-method */
import { ConflictException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import axios from 'axios'
import { DataSource, Repository } from 'typeorm'

import { AuthService } from '../auth/auth.service'
import { Business } from '../businesses/entities/business.entity'
import { InvitesService } from '../invites/invites.service'
import { TelegramLinksService } from '../telegram/services/telegram-links.service'
import { User } from '../users/entities/user.entity'
import { UsersService } from '../users/users.service'
import { RegistrationsService } from './registrations.service'

describe('RegistrationsService', () => {
	let service: RegistrationsService
	let businessRepo: Repository<Business>
	let userRepo: Repository<User>
	let authService: { validateInitData: jest.Mock }
	let usersService: { isPlatformOwner: jest.Mock }
	let invitesService: { findPendingForTelegramId: jest.Mock }
	let dataSource: { transaction: jest.Mock }
	let configService: { get: jest.Mock }
	let telegramLinksService: { getMiniAppUrl: jest.Mock }

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				RegistrationsService,
				{
					provide: getRepositoryToken(Business),
					useValue: {
						find: jest.fn(),
						findOne: jest.fn(),
						save: jest.fn(),
					},
				},
				{
					provide: getRepositoryToken(User),
					useValue: {
						findOne: jest.fn(),
						save: jest.fn(),
					},
				},
				{ provide: AuthService, useValue: { validateInitData: jest.fn() } },
				{ provide: UsersService, useValue: { isPlatformOwner: jest.fn() } },
				{ provide: InvitesService, useValue: { findPendingForTelegramId: jest.fn() } },
				{ provide: DataSource, useValue: { transaction: jest.fn() } },
				{ provide: ConfigService, useValue: { get: jest.fn() } },
				{ provide: TelegramLinksService, useValue: { getMiniAppUrl: jest.fn().mockReturnValue('https://mini-app.example.com') } },
			],
		}).compile()

		service = module.get<RegistrationsService>(RegistrationsService)
		businessRepo = module.get<Repository<Business>>(getRepositoryToken(Business))
		userRepo = module.get<Repository<User>>(getRepositoryToken(User))
		authService = module.get(AuthService)
		usersService = module.get(UsersService)
		invitesService = module.get(InvitesService)
		dataSource = module.get(DataSource)
		configService = module.get(ConfigService)
		telegramLinksService = module.get(TelegramLinksService)
	})

	afterEach(() => {
		jest.restoreAllMocks()
	})

	describe('pre-registration entry state', () => {
		const validatedTelegramData = {
			telegramUserId: '4242',
			displayName: 'Abe Bekele',
			language: 'am' as const,
			auth_date: Math.floor(Date.now() / 1000),
			hash: 'valid-hash',
		}

		beforeEach(() => {
			authService.validateInitData.mockReturnValue(validatedTelegramData)
			usersService.isPlatformOwner.mockReturnValue(false)
			invitesService.findPendingForTelegramId.mockResolvedValue(null)
		})

		it('returns an unregistered state from signed Telegram identity data', async () => {
			jest.spyOn(userRepo, 'findOne').mockResolvedValue(null)

			await expect(service.getEntryState('signed-init-data')).resolves.toMatchObject({
				status: 'unregistered',
				telegramUserId: '4242',
				displayName: 'Abe Bekele',
				language: 'am',
			})
			expect(authService.validateInitData).toHaveBeenCalledWith('signed-init-data')
		})

		it('returns a pending Invite before checking Registration state', async () => {
			const invite = {
				id: 'invite-1',
				businessId: 'business-1',
				role: 'manager',
				expiresAt: new Date(Date.now() + 60_000),
				business: { id: 'business-1', name: 'Cafe Addis' },
			} as never
			invitesService.findPendingForTelegramId.mockResolvedValue(invite)

			const result = await service.getEntryState('signed-init-data')

			expect(result).toMatchObject({
				status: 'invited',
				invite: { id: 'invite-1', businessName: 'Cafe Addis', role: 'manager' },
			})
			expect(userRepo.findOne).not.toHaveBeenCalled()
			await expect(service.submitSelfRegistration('signed-init-data', '')).resolves.toMatchObject({ status: 'invited' })
		})

		it('revises the same rejected Business and moves it back to pending', async () => {
			const business = {
				id: 'business-1',
				name: 'Old Name',
				status: 'rejected',
				rejectionReason: 'Please use the registered trading name.',
				createdAt: new Date(),
			} as Business
			const user = {
				id: 'user-1',
				telegramUserId: '4242',
				displayName: 'Old Display Name',
				language: 'en',
				business,
				removedAt: null,
			} as unknown as User
			jest.spyOn(userRepo, 'findOne').mockResolvedValue(user)
			jest.spyOn(businessRepo, 'save').mockImplementation((value) => Promise.resolve(value as Business))
			jest.spyOn(userRepo, 'save').mockImplementation((value) => Promise.resolve(value as User))

			const result = await service.submitSelfRegistration('signed-init-data', '  Cafe Addis  ', 'am')

			expect(result).toMatchObject({ status: 'pending', registration: { id: 'business-1', businessName: 'Cafe Addis' } })
			expect(business).toMatchObject({ name: 'Cafe Addis', status: 'pending', rejectionReason: null })
			expect(user).toMatchObject({ displayName: 'Abe Bekele', language: 'am' })
			expect(dataSource.transaction).not.toHaveBeenCalled()
		})

		it('treats a repeated pending submission as an idempotent read', async () => {
			const business = { id: 'business-1', name: 'Cafe Addis', status: 'pending', createdAt: new Date() } as Business
			const user = {
				id: 'user-1',
				telegramUserId: '4242',
				displayName: 'Abe Bekele',
				language: 'am',
				business,
				removedAt: null,
				role: 'owner',
			} as unknown as User
			jest.spyOn(userRepo, 'findOne').mockResolvedValue(user)

			const result = await service.submitSelfRegistration('signed-init-data', 'A different name')

			expect(result.status).toBe('pending')
			expect(result.registration?.businessName).toBe('Cafe Addis')
			expect(dataSource.transaction).not.toHaveBeenCalled()
			expect(businessRepo.save).not.toHaveBeenCalled()
		})

		it('recovers from a concurrent unique-account race as an idempotent read', async () => {
			const business = { id: 'business-1', name: 'Cafe Addis', status: 'pending', createdAt: new Date() } as Business
			const user = {
				id: 'user-1',
				telegramUserId: '4242',
				displayName: 'Abe Bekele',
				language: 'am',
				business,
				removedAt: null,
				role: 'owner',
			} as unknown as User
			jest.spyOn(userRepo, 'findOne').mockResolvedValueOnce(null).mockResolvedValueOnce(user)
			dataSource.transaction.mockRejectedValue({ code: '23505' })

			const result = await service.submitSelfRegistration('signed-init-data', 'Cafe Addis')

			expect(result.status).toBe('pending')
			expect(userRepo.findOne).toHaveBeenCalledTimes(2)
		})

		it('creates a pending Business and notifies the Platform Owner once', async () => {
			const business = { id: 'business-1', name: 'Cafe Addis', status: 'pending', ownerUserId: null, createdAt: new Date() } as Business
			const owner = {
				id: 'user-1',
				telegramUserId: '4242',
				displayName: 'Abe Bekele',
				language: 'am',
				business,
				businessId: 'business-1',
				role: 'owner',
				removedAt: null,
			} as unknown as User
			const businessRepository = {
				create: jest.fn().mockReturnValue(business),
				save: jest.fn().mockResolvedValue(business),
			}
			const userRepository = {
				create: jest.fn().mockReturnValue(owner),
				save: jest.fn().mockResolvedValue(owner),
			}
			jest.spyOn(userRepo, 'findOne').mockResolvedValueOnce(null).mockResolvedValueOnce(owner)
			const transactionManager = {
				getRepository: (entity: unknown) => (entity === Business ? businessRepository : userRepository),
			}
			dataSource.transaction.mockImplementation((callback: (manager: typeof transactionManager) => Promise<unknown>) =>
				Promise.resolve(callback(transactionManager)),
			)
			configService.get.mockImplementation((key: string) => ({ PLATFORM_OWNER_TELEGRAM_ID: '999', TELEGRAM_BOT_TOKEN: 'bot-token' })[key])
			const telegramPost = jest.spyOn(axios, 'post').mockResolvedValue({ data: { ok: true } } as never)

			const result = await service.submitSelfRegistration('signed-init-data', 'Cafe Addis')

			expect(result.status).toBe('pending')
			expect(businessRepository.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Cafe Addis', status: 'pending' }))
			expect(telegramPost).toHaveBeenCalledWith('https://api.telegram.org/botbot-token/sendMessage', expect.objectContaining({ chat_id: '999' }))
			const telegramCall = (telegramPost.mock.calls[0] as unknown[] | undefined) ?? []
			const telegramPayload = telegramCall[1] as { chat_id: string; text: string; parse_mode: string }
			expect(telegramPayload.text).toContain('Cafe Addis')
			expect(telegramPayload.text).toContain('Prospective Owner')
			expect(telegramPayload.text.match(/4242/g)).toHaveLength(1)
			expect(telegramPayload.parse_mode).toBe('HTML')
		})
	})

	describe('approveBusiness', () => {
		it('should approve a pending business', async () => {
			const business = { id: '123', status: 'pending', name: 'Test Business' } as Business
			jest.spyOn(businessRepo, 'findOne').mockResolvedValue(business)
			jest.spyOn(businessRepo, 'save').mockResolvedValue({ ...business, status: 'active' } as Business)

			const result = await service.approveBusiness('123')

			expect(result.status).toBe('active')
			expect(result.changed).toBe(true)
			expect(businessRepo.save).toHaveBeenCalled()
		})

		it('should promote the registrant to owner on approval', async () => {
			const business = { id: '123', status: 'pending', name: 'Test Business', ownerUserId: 'user-1' } as Business
			const registrant = { id: 'user-1', role: 'waiter' } as User
			jest.spyOn(businessRepo, 'findOne').mockResolvedValue(business)
			jest.spyOn(businessRepo, 'save').mockResolvedValue({ ...business, status: 'active' } as Business)
			jest.spyOn(userRepo, 'findOne').mockResolvedValue(registrant)
			jest.spyOn(userRepo, 'save').mockImplementation((user) => Promise.resolve(user as User))

			const result = await service.approveBusiness('123')

			expect(result.status).toBe('active')
			expect(userRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1', role: 'owner' }))
		})

		it('notifies the Prospective Owner once with escaped HTML and no literal Mini App action', async () => {
			const business = { id: '123', status: 'pending', name: 'Cafe <Addis> & Co', ownerUserId: 'user-1' } as Business
			const registrant = {
				id: 'user-1',
				role: 'owner',
				telegramUserId: '111',
				language: 'en',
			} as User
			jest.spyOn(businessRepo, 'findOne').mockResolvedValue(business)
			jest.spyOn(businessRepo, 'save').mockImplementation((value) => Promise.resolve(value as Business))
			jest.spyOn(userRepo, 'findOne').mockResolvedValue(registrant)
			configService.get.mockImplementation((key: string) => (key === 'TELEGRAM_BOT_TOKEN' ? 'bot-token' : undefined))
			const telegramPost = jest.spyOn(axios, 'post').mockResolvedValue({ data: { ok: true } } as never)

			await service.approveBusiness('123')
			await service.approveBusiness('123')

			expect(telegramPost).toHaveBeenCalledTimes(1)
			const telegramCall = (telegramPost.mock.calls[0] as unknown[] | undefined) ?? []
			const payload = telegramCall[1] as {
				chat_id: string
				text: string
				parse_mode: string
				reply_markup?: { inline_keyboard: { text: string; web_app: { url: string } }[][] }
			}
			expect(telegramCall[0]).toBe('https://api.telegram.org/botbot-token/sendMessage')
			expect(payload).toMatchObject({ chat_id: '111', parse_mode: 'HTML' })
			expect(payload.text).toContain('Cafe &lt;Addis&gt; &amp; Co')
			expect(payload.text).not.toContain('Mini App')
			expect(payload.reply_markup).toBeUndefined()
			expect(telegramLinksService.getMiniAppUrl).not.toHaveBeenCalled()
		})

		it('should not re-save a registrant who is already owner', async () => {
			const business = { id: '123', status: 'pending', name: 'Test Business', ownerUserId: 'user-1' } as Business
			const registrant = { id: 'user-1', role: 'owner' } as User
			jest.spyOn(businessRepo, 'findOne').mockResolvedValue(business)
			jest.spyOn(businessRepo, 'save').mockResolvedValue({ ...business, status: 'active' } as Business)
			jest.spyOn(userRepo, 'findOne').mockResolvedValue(registrant)

			await service.approveBusiness('123')

			expect(userRepo.save).not.toHaveBeenCalled()
		})

		it('should be idempotent for already active businesses', async () => {
			const business = { id: '123', status: 'active', name: 'Test Business' } as Business
			jest.spyOn(businessRepo, 'findOne').mockResolvedValue(business)

			const result = await service.approveBusiness('123')

			expect(result.status).toBe('active')
			expect(result.changed).toBe(false)
			expect(businessRepo.save).not.toHaveBeenCalled()
		})

		it('should throw error for non-existent business', async () => {
			jest.spyOn(businessRepo, 'findOne').mockResolvedValue(null)

			await expect(service.approveBusiness('invalid-id')).rejects.toThrow(NotFoundException)
		})

		it('should throw error when approving rejected business', async () => {
			const business = { id: '123', status: 'rejected', name: 'Test Business' } as Business
			jest.spyOn(businessRepo, 'findOne').mockResolvedValue(business)

			await expect(service.approveBusiness('123')).rejects.toThrow(ConflictException)
		})
	})

	describe('rejectBusiness', () => {
		it('should reject a pending business', async () => {
			const business = { id: '123', status: 'pending', name: 'Test Business' } as Business
			jest.spyOn(businessRepo, 'findOne').mockResolvedValue(business)
			jest.spyOn(businessRepo, 'save').mockResolvedValue({ ...business, status: 'rejected' } as Business)

			const result = await service.rejectBusiness('123', 'Please use the registered trading name.')

			expect(result.status).toBe('rejected')
			expect(result.changed).toBe(true)
			expect(businessRepo.save).toHaveBeenCalled()
			expect(business).toMatchObject({ status: 'rejected', rejectionReason: 'Please use the registered trading name.' })
		})

		it('notifies the Prospective Owner once in Amharic with escaped feedback and a revision action', async () => {
			const business = { id: '123', status: 'pending', name: 'Cafe Addis', ownerUserId: 'user-1' } as Business
			const registrant = {
				id: 'user-1',
				role: 'owner',
				telegramUserId: '111',
				language: 'am',
			} as User
			jest.spyOn(businessRepo, 'findOne').mockResolvedValue(business)
			jest.spyOn(businessRepo, 'save').mockImplementation((value) => Promise.resolve(value as Business))
			jest.spyOn(userRepo, 'findOne').mockResolvedValue(registrant)
			configService.get.mockImplementation((key: string) => (key === 'TELEGRAM_BOT_TOKEN' ? 'bot-token' : undefined))
			const telegramPost = jest.spyOn(axios, 'post').mockResolvedValue({ data: { ok: true } } as never)

			await service.rejectBusiness('123', 'Use <official> & registered name')
			await service.rejectBusiness('123', 'Use <official> & registered name')

			expect(telegramPost).toHaveBeenCalledTimes(1)
			const telegramCall = (telegramPost.mock.calls[0] as unknown[] | undefined) ?? []
			const payload = telegramCall[1] as {
				chat_id: string
				text: string
				parse_mode: string
				reply_markup: { inline_keyboard: { text: string; web_app: { url: string } }[][] }
			}
			expect(payload).toMatchObject({ chat_id: '111', parse_mode: 'HTML' })
			expect(payload.text).toContain('Use &lt;official&gt; &amp; registered name')
			expect(payload.reply_markup.inline_keyboard[0][0]).toEqual({
				text: 'ምዝገባዎን ያስተካክሉ',
				web_app: { url: 'https://mini-app.example.com' },
			})
		})

		it('should be idempotent for already rejected businesses', async () => {
			const business = { id: '123', status: 'rejected', name: 'Test Business' } as Business
			jest.spyOn(businessRepo, 'findOne').mockResolvedValue(business)

			const result = await service.rejectBusiness('123')

			expect(result.status).toBe('rejected')
			expect(result.changed).toBe(false)
			expect(businessRepo.save).not.toHaveBeenCalled()
		})

		it('should throw error when rejecting active business', async () => {
			const business = { id: '123', status: 'active', name: 'Test Business' } as Business
			jest.spyOn(businessRepo, 'findOne').mockResolvedValue(business)

			await expect(service.rejectBusiness('123')).rejects.toThrow(ConflictException)
		})
	})
})
