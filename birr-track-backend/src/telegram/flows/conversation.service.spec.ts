import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'

import { BusinessesService } from '../../businesses/businesses.service'
import { InvitesService } from '../../invites/invites.service'
import { UsersService } from '../../users/users.service'
import { ConversationService } from './conversation.service'

describe('ConversationService', () => {
	let service: ConversationService

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				ConversationService,
				{
					provide: UsersService,
					useValue: {
						isPlatformOwner: jest.fn(),
						findByTelegramId: jest.fn(),
						joinBusiness: jest.fn(),
						findById: jest.fn(),
						hasRoleAtLeast: jest.fn(),
					},
				},
				{
					provide: BusinessesService,
					useValue: {
						create: jest.fn(),
						findById: jest.fn(),
						save: jest.fn(),
					},
				},
				{
					provide: InvitesService,
					useValue: {
						create: jest.fn(),
						redeem: jest.fn(),
					},
				},
				{
					provide: ConfigService,
					useValue: {
						get: jest.fn(),
					},
				},
			],
		}).compile()

		service = module.get<ConversationService>(ConversationService)
	})

	it('should be defined', () => {
		expect(service).toBeDefined()
	})
})
