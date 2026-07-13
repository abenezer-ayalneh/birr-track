import { UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { JwtPayload } from '../auth/auth.service'
import { GetTransactionsQueryDto } from './dto/get-transactions-query.dto'
import { ExportLinkService } from './export-link.service'

describe('ExportLinkService', () => {
	let service: ExportLinkService

	const auth: JwtPayload = {
		userId: 'manager-1',
		businessId: 'business-1',
		role: 'manager',
		telegramUserId: '123456789',
		iat: 1,
		exp: 2,
	}

	beforeEach(() => {
		service = new ExportLinkService({ get: jest.fn().mockReturnValue('test-jwt-secret') } as unknown as ConfigService)
	})

	afterEach(() => {
		jest.useRealTimers()
	})

	it('round-trips the authenticated business scope and export filters', () => {
		const query = Object.assign(new GetTransactionsQueryDto(), {
			startDate: '2026-07-01T00:00:00.000+03:00',
			endDate: '2026-07-14T23:59:59.999+03:00',
			status: 'recorded',
			bank: 'CBE',
			duplicate: '1',
		})

		const issued = service.create(query, auth)
		const verified = service.verify(issued.token)

		expect(verified.auth).toEqual(expect.objectContaining({ businessId: 'business-1', role: 'manager', userId: 'manager-1' }))
		expect(verified.queryDto).toEqual(
			expect.objectContaining({
				startDate: query.startDate,
				endDate: query.endDate,
				status: 'recorded',
				bank: 'CBE',
				duplicate: '1',
			}),
		)
	})

	it('rejects a tampered token', () => {
		const issued = service.create(new GetTransactionsQueryDto(), auth)
		const tampered = `${issued.token.slice(0, -1)}x`

		expect(() => service.verify(tampered)).toThrow(UnauthorizedException)
	})

	it('rejects an expired token', () => {
		jest.useFakeTimers().setSystemTime(new Date('2026-07-14T00:00:00Z'))
		const issued = service.create(new GetTransactionsQueryDto(), auth)
		jest.setSystemTime(new Date('2026-07-14T00:03:00Z'))

		expect(() => service.verify(issued.token)).toThrow('Export token expired')
	})
})
