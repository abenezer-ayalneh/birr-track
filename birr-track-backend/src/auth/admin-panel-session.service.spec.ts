import { ConfigService } from '@nestjs/config'

import { AdminPanelSessionService } from './admin-panel-session.service'

const store = new Map<string, string>()
const sets = new Map<string, Set<string>>()

jest.mock('ioredis', () => {
	return jest.fn().mockImplementation(() => ({
		set: jest.fn(async (key: string, value: string) => {
			store.set(key, value)
			return 'OK'
		}),
		get: jest.fn(async (key: string) => store.get(key) ?? null),
		del: jest.fn(async (key: string) => {
			const existed = store.delete(key)
			sets.delete(key)
			return existed ? 1 : 0
		}),
		sadd: jest.fn(async (key: string, value: string) => {
			const values = sets.get(key) ?? new Set<string>()
			values.add(value)
			sets.set(key, values)
			return 1
		}),
		srem: jest.fn(async (key: string, value: string) => {
			const values = sets.get(key)
			return values?.delete(value) ? 1 : 0
		}),
		smembers: jest.fn(async (key: string) => [...(sets.get(key) ?? [])]),
		expire: jest.fn(async () => 1),
		pipeline: jest.fn(() => {
			const commands: Array<() => void> = []
			const pipeline = {
				del: (key: string) => {
					commands.push(() => {
						store.delete(key)
						sets.delete(key)
					})
					return pipeline
				},
				exec: async () => {
					commands.forEach((command) => command())
					return []
				},
			}
			return pipeline
		}),
		quit: jest.fn(async () => 'OK'),
	}))
})

describe('AdminPanelSessionService', () => {
	let service: AdminPanelSessionService
	let nowSeconds: number

	beforeEach(() => {
		store.clear()
		sets.clear()
		nowSeconds = 1_700_000_000
		jest.spyOn(Date, 'now').mockImplementation(() => nowSeconds * 1000)
		service = new AdminPanelSessionService({
			get: jest.fn((key: string, fallback?: string) => {
				const config: Record<string, string> = {
					REDIS_HOST: '127.0.0.1',
					REDIS_PORT: '6379',
					ADMIN_PANEL_ACCESS_TOKEN_TTL_SECONDS: '900',
					ADMIN_PANEL_SESSION_IDLE_TTL_SECONDS: '1800',
					ADMIN_PANEL_SESSION_MAX_TTL_SECONDS: '43200',
				}
				return config[key] ?? fallback
			}),
		} as unknown as ConfigService)
	})

	afterEach(() => {
		jest.restoreAllMocks()
	})

	it('creates an Admin Panel Session with idle and absolute expiry', async () => {
		const created = await service.create({
			userId: 'user-1',
			businessId: 'business-1',
			role: 'waiter',
			telegramUserId: '123',
		})

		expect(created.sessionId).toBeTruthy()
		expect(created.refreshToken).toBeTruthy()
		expect(created.accessTokenExpiresInSeconds).toBe(900)
		expect(created.idleExpiresAt).toBe(nowSeconds + 1800)
		expect(created.expiresAt).toBe(nowSeconds + 43200)
		expect(await service.assertActive(created.sessionId)).toBe(true)
	})

	it('renews before idle timeout and slides only the idle expiry', async () => {
		const created = await service.create({
			userId: 'user-1',
			businessId: 'business-1',
			role: 'manager',
			telegramUserId: '123',
		})

		nowSeconds += 900
		const renewed = await service.renew(created.sessionId, created.refreshToken)

		expect(renewed.idleExpiresAt).toBe(nowSeconds + 1800)
		expect(renewed.expiresAt).toBe(created.expiresAt)
		expect(renewed.record.payload.role).toBe('manager')
	})

	it('fails after idle timeout', async () => {
		const created = await service.create({
			userId: 'user-1',
			businessId: 'business-1',
			role: 'owner',
			telegramUserId: '123',
		})

		nowSeconds += 1801

		await expect(service.renew(created.sessionId, created.refreshToken)).rejects.toThrow('Admin Panel Session expired')
		expect(await service.assertActive(created.sessionId)).toBe(false)
	})

	it('fails after absolute lifetime', async () => {
		const created = await service.create({
			userId: null,
			businessId: null,
			role: 'platform_owner',
			telegramUserId: '999',
		})

		nowSeconds += 900

		await expect(service.renew(created.sessionId, created.refreshToken)).resolves.toMatchObject({
			expiresAt: created.expiresAt,
		})

		nowSeconds = created.expiresAt + 1

		await expect(service.renew(created.sessionId, created.refreshToken)).rejects.toThrow('Admin Panel Session expired')
	})

	it('revokes a session', async () => {
		const created = await service.create({
			userId: 'user-1',
			businessId: 'business-1',
			role: 'waiter',
			telegramUserId: '123',
		})

		await service.revoke(created.sessionId)

		expect(await service.assertActive(created.sessionId)).toBe(false)
	})

	it('revokes every known session for a user', async () => {
		const first = await service.create({ userId: 'user-1', businessId: 'business-1', role: 'waiter', telegramUserId: '123' })
		const second = await service.create({ userId: 'user-1', businessId: 'business-1', role: 'waiter', telegramUserId: '123' })

		await service.revokeAllForUser('user-1')

		expect(await service.assertActive(first.sessionId)).toBe(false)
		expect(await service.assertActive(second.sessionId)).toBe(false)
	})
})
