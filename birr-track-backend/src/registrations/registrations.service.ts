import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import axios from 'axios'
import { DataSource, IsNull, Repository } from 'typeorm'

import { AuthService } from '../auth/auth.service'
import { Business, BusinessStatus } from '../businesses/entities/business.entity'
import { Invite } from '../invites/entities/invite.entity'
import { InvitesService } from '../invites/invites.service'
import { describeError } from '../shared/utils/describe-error.util'
import { TelegramLinksService } from '../telegram/services/telegram-links.service'
import { botText } from '../telegram/telegram.i18n'
import { renderBotHtml, withTelegramHtml } from '../telegram/telegram-html'
import { User } from '../users/entities/user.entity'
import { UsersService } from '../users/users.service'

export type RegistrationDecision = {
	status: BusinessStatus
	message: string
	/** False when the call was an idempotent no-op (business already in the target status). */
	changed: boolean
	business: Business
}

export type PendingRegistration = {
	businessId: string
	businessName: string
	status: string
	registrant: {
		userId: string
		telegramUserId: string
		displayName: string
	}
	createdAt: Date
}

export type RegistrationEntryStatus = 'unregistered' | 'invited' | 'pending' | 'rejected' | 'active' | 'platform_owner'

export type RegistrationEntryState = {
	status: RegistrationEntryStatus
	telegramUserId: string
	displayName: string
	language: 'en' | 'am'
	userId?: string
	role?: User['role']
	business?: { id: string; name: string; status: BusinessStatus; createdAt: Date }
	registration?: { id: string; businessName: string; requestedAt: Date }
	rejectionReason?: string | null
	invite?: { id: string; businessId: string; businessName: string; role: Invite['role']; expiresAt: Date }
}

@Injectable()
export class RegistrationsService {
	private readonly logger = new Logger(RegistrationsService.name)

	constructor(
		@InjectRepository(Business)
		private readonly businessRepository: Repository<Business>,
		@InjectRepository(User)
		private readonly userRepository: Repository<User>,
		private readonly authService: AuthService,
		private readonly usersService: UsersService,
		private readonly invitesService: InvitesService,
		private readonly dataSource: DataSource,
		private readonly configService: ConfigService,
		private readonly telegramLinksService: TelegramLinksService,
	) {}

	/**
	 * Read-only, signed Telegram entry state used before a normal Admin Panel session exists.
	 * Pending Invites deliberately take precedence over registration state.
	 */
	async getEntryState(initData: string): Promise<RegistrationEntryState> {
		const validated = this.authService.validateInitData(initData)
		if (this.usersService.isPlatformOwner(validated.telegramUserId)) {
			return {
				status: 'platform_owner',
				telegramUserId: validated.telegramUserId,
				displayName: 'Platform Owner',
				language: 'en',
			}
		}

		const invite = await this.invitesService.findPendingForTelegramId(validated.telegramUserId)
		if (invite) return this.toInvitedState(validated.telegramUserId, validated.displayName, validated.language, invite)

		const user = await this.userRepository.findOne({
			where: { telegramUserId: validated.telegramUserId, removedAt: IsNull() },
			relations: { business: true },
		})
		if (!user?.business) {
			return { status: 'unregistered', telegramUserId: validated.telegramUserId, displayName: validated.displayName, language: validated.language }
		}

		return this.toUserEntryState(user, validated.displayName, validated.language)
	}

	/**
	 * Creates a pending Business and prospective Owner, or idempotently returns the
	 * current state. A rejected Business is revised and moved back to pending.
	 */
	async submitSelfRegistration(initData: string, businessName: string, language?: 'en' | 'am'): Promise<RegistrationEntryState> {
		const validated = this.authService.validateInitData(initData)
		if (this.usersService.isPlatformOwner(validated.telegramUserId)) {
			throw new ConflictException('The Platform Owner cannot register a Business')
		}

		const invite = await this.invitesService.findPendingForTelegramId(validated.telegramUserId)
		if (invite) return this.toInvitedState(validated.telegramUserId, validated.displayName, validated.language, invite)

		const normalizedName = businessName.trim()
		if (!normalizedName) throw new BadRequestException('Business name cannot be empty')

		const existing = await this.userRepository.findOne({
			where: { telegramUserId: validated.telegramUserId },
			relations: { business: true },
		})
		if (existing?.removedAt) {
			throw new ConflictException('This Telegram account already has Business history. Accept a new Invite or contact support.')
		}

		if (existing?.business) {
			if (existing.business.status === 'rejected') {
				existing.displayName = validated.displayName
				existing.language = language ?? validated.language
				existing.business.name = normalizedName
				existing.business.status = 'pending'
				existing.business.rejectionReason = null
				await this.businessRepository.save(existing.business)
				await this.userRepository.save(existing)
				await this.notifyPlatformOwner(existing.business, validated.telegramUserId, validated.displayName)
				return this.toUserEntryState(existing, validated.displayName, validated.language)
			}
			return this.toUserEntryState(existing, validated.displayName, validated.language)
		}

		let createdBusiness: Business | null = null
		try {
			await this.dataSource.transaction(async (manager) => {
				const businesses = manager.getRepository(Business)
				const users = manager.getRepository(User)
				const business = await businesses.save(businesses.create({ name: normalizedName, status: 'pending', ownerUserId: null, rejectionReason: null }))
				createdBusiness = business
				const owner = await users.save(
					users.create({
						telegramUserId: validated.telegramUserId,
						displayName: validated.displayName,
						businessId: business.id,
						role: 'owner',
						language: language ?? validated.language,
						removedAt: null,
					}),
				)
				business.ownerUserId = owner.id
				await businesses.save(business)
			})
		} catch (error) {
			// Two Telegram retries can race before either sees the unique account row.
			// A Postgres unique violation means the other request won; return its state.
			if (this.isUniqueConstraintError(error)) return this.getEntryState(initData)
			throw error
		}

		const state = await this.getEntryState(initData)
		if (createdBusiness) await this.notifyPlatformOwner(createdBusiness, validated.telegramUserId, validated.displayName)
		return state
	}

	async getPendingRegistrations(): Promise<PendingRegistration[]> {
		const businesses = await this.businessRepository.find({ where: { status: 'pending' } })

		const result: PendingRegistration[] = []

		for (const business of businesses) {
			if (!business.ownerUserId) {
				continue
			}

			const owner = await this.userRepository.findOne({ where: { id: business.ownerUserId } })
			if (!owner) {
				continue
			}

			result.push({
				businessId: business.id,
				businessName: business.name,
				status: business.status,
				registrant: {
					userId: owner.id,
					telegramUserId: owner.telegramUserId.toString(),
					displayName: owner.displayName,
				},
				createdAt: business.createdAt,
			})
		}

		return result.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
	}

	async approveBusiness(businessId: string): Promise<RegistrationDecision> {
		const business = await this.businessRepository.findOne({ where: { id: businessId } })
		if (!business) {
			throw new NotFoundException(`Business ${businessId} not found`)
		}

		// Idempotent: approving an already-active business is a no-op success
		if (business.status === 'active') {
			this.logger.log(`Business ${businessId} already active (idempotent approve)`)
			return { status: 'active', message: 'Business is already active', changed: false, business }
		}

		// Cannot approve a rejected business
		if (business.status === 'rejected') {
			throw new ConflictException(`Cannot approve a rejected business ${businessId}`)
		}

		if (business.status === 'suspended') {
			throw new ConflictException(`Cannot approve a suspended business ${businessId}`)
		}

		business.status = 'active'
		await this.businessRepository.save(business)
		const prospectiveOwner = await this.promoteRegistrantToOwner(business)
		await this.notifyProspectiveOwner(prospectiveOwner, business, 'approved')

		this.logger.log(`Business ${businessId} approved`)
		return { status: 'active', message: 'Business approved successfully', changed: true, business }
	}

	async rejectBusiness(businessId: string, reason?: string): Promise<RegistrationDecision> {
		const business = await this.businessRepository.findOne({ where: { id: businessId } })
		if (!business) {
			throw new NotFoundException(`Business ${businessId} not found`)
		}

		// Idempotent: rejecting an already-rejected business is a no-op success
		if (business.status === 'rejected') {
			if (reason?.trim() && business.rejectionReason !== reason.trim()) {
				business.rejectionReason = reason.trim()
				await this.businessRepository.save(business)
			}
			this.logger.log(`Business ${businessId} already rejected (idempotent reject)`)
			return { status: 'rejected', message: 'Business is already rejected', changed: false, business }
		}

		// Cannot reject an active business
		if (business.status === 'active') {
			throw new ConflictException(`Cannot reject an active business ${businessId}`)
		}

		if (business.status === 'suspended') {
			throw new ConflictException(`Cannot reject a suspended business ${businessId}`)
		}

		business.status = 'rejected'
		business.rejectionReason = reason?.trim() || null
		await this.businessRepository.save(business)
		const prospectiveOwner = await this.findProspectiveOwner(business)
		await this.notifyProspectiveOwner(prospectiveOwner, business, 'rejected')

		this.logger.log(`Business ${businessId} rejected`)
		return { status: 'rejected', message: 'Business rejected successfully', changed: true, business }
	}

	/** Spec §3.1: on approve the registrant becomes Owner. No-op if already owner or missing. */
	private async promoteRegistrantToOwner(business: Business): Promise<User | null> {
		if (!business.ownerUserId) {
			return null
		}

		const registrant = await this.userRepository.findOne({ where: { id: business.ownerUserId } })
		if (!registrant) {
			this.logger.warn(`Registrant ${business.ownerUserId} for business ${business.id} not found; skipping owner promotion`)
			return null
		}

		if (registrant.role === 'owner') {
			return registrant
		}

		registrant.role = 'owner'
		await this.userRepository.save(registrant)
		this.logger.log(`User ${registrant.id} promoted to owner of business ${business.id}`)
		return registrant
	}

	private async findProspectiveOwner(business: Business): Promise<User | null> {
		if (!business.ownerUserId) return null
		return this.userRepository.findOne({ where: { id: business.ownerUserId } })
	}

	private toInvitedState(telegramUserId: string, displayName: string, language: 'en' | 'am', invite: Invite): RegistrationEntryState {
		return {
			status: 'invited',
			telegramUserId,
			displayName,
			language,
			invite: {
				id: invite.id,
				businessId: invite.businessId,
				businessName: invite.business.name,
				role: invite.role,
				expiresAt: invite.expiresAt,
			},
		}
	}

	private toUserEntryState(user: User, fallbackDisplayName: string, fallbackLanguage: 'en' | 'am'): RegistrationEntryState {
		const business = user.business
		if (!business) {
			return {
				status: 'unregistered',
				telegramUserId: user.telegramUserId,
				displayName: user.displayName || fallbackDisplayName,
				language: user.language || fallbackLanguage,
			}
		}

		const base = {
			telegramUserId: user.telegramUserId,
			displayName: user.displayName || fallbackDisplayName,
			language: user.language || fallbackLanguage,
			userId: user.id,
			role: user.role,
			business: { id: business.id, name: business.name, status: business.status, createdAt: business.createdAt },
		}

		if (business.status === 'pending') {
			return {
				...base,
				status: 'pending',
				registration: { id: business.id, businessName: business.name, requestedAt: business.createdAt },
			}
		}
		if (business.status === 'rejected') {
			return {
				...base,
				status: 'rejected',
				registration: { id: business.id, businessName: business.name, requestedAt: business.createdAt },
				rejectionReason: business.rejectionReason,
			}
		}
		return { ...base, status: 'active' }
	}

	private isUniqueConstraintError(error: unknown): boolean {
		if (!error || typeof error !== 'object') return false
		return (error as { code?: unknown }).code === '23505'
	}

	private async notifyProspectiveOwner(owner: User | null, business: Business, decision: 'approved' | 'rejected'): Promise<void> {
		const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN')?.trim()
		if (!botToken || !owner) return

		const t = botText(owner.language)

		try {
			const text =
				decision === 'approved'
					? renderBotHtml(t.ownerApproved, { businessName: business.name })
					: renderBotHtml(t.ownerRejected, {
							businessName: business.name,
							reason: business.rejectionReason ? `${t.reasonPrefix}${business.rejectionReason}` : t.reasonNotProvided,
							nextStep: t.rejectedNextStep,
						})
			const buttonText = decision === 'approved' ? t.openMiniApp : t.reviseRegistration
			await axios.post(
				`https://api.telegram.org/bot${botToken}/sendMessage`,
				withTelegramHtml({
					chat_id: owner.telegramUserId,
					text,
					reply_markup: {
						inline_keyboard: [[{ text: buttonText, web_app: { url: this.telegramLinksService.getMiniAppUrl() } }]],
					},
				}),
			)
		} catch (error) {
			this.logger.error(`Failed to notify Prospective Owner ${owner.id} that registration ${business.id} was ${decision}: ${describeError(error)}`)
		}
	}

	private async notifyPlatformOwner(business: Business, telegramUserId: string, displayName: string): Promise<void> {
		const platformOwnerId = this.configService.get<string>('PLATFORM_OWNER_TELEGRAM_ID')?.trim()
		const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN')?.trim()
		if (!platformOwnerId || !botToken || !business.id || !business.ownerUserId) return

		const t = botText('en')

		try {
			const message = renderBotHtml(t.newRegistration, {
				businessName: business.name,
				registrantName: displayName,
				telegramUserId,
			})
			await axios.post(
				`https://api.telegram.org/bot${botToken}/sendMessage`,
				withTelegramHtml({
					chat_id: platformOwnerId,
					text: message,
					reply_markup: {
						inline_keyboard: [
							[
								{ text: t.approveButton, callback_data: `approve_biz_${business.id}` },
								{ text: t.rejectButton, callback_data: `reject_biz_${business.id}` },
							],
						],
					},
				}),
			)
		} catch (error) {
			this.logger.error(`Failed to notify Platform Owner of registration ${business.id}: ${describeError(error)}`)
		}
	}
}
