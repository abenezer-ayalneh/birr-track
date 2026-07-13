import { Injectable, Logger } from '@nestjs/common'

import { User } from './entities/user.entity'

export type MembershipDepartureEvent = {
	kind: 'left' | 'removed'
	member: Pick<User, 'id' | 'telegramUserId' | 'displayName' | 'role' | 'language' | 'businessId'>
	businessId: string
	actor?: Pick<User, 'id' | 'displayName' | 'role' | 'language'>
	reason?: string
}

export type MembershipEventListener = (event: MembershipDepartureEvent) => void | Promise<void>

/**
 * In-process domain events keep the Users domain independent from Telegram delivery.
 * Membership changes have already committed before an event is published.
 */
@Injectable()
export class MembershipEventsService {
	private readonly logger = new Logger(MembershipEventsService.name)
	private readonly listeners = new Set<MembershipEventListener>()

	subscribe(listener: MembershipEventListener): () => void {
		this.listeners.add(listener)
		return () => this.listeners.delete(listener)
	}

	publish(event: MembershipDepartureEvent): void {
		for (const listener of this.listeners) {
			Promise.resolve(listener(event)).catch((error: unknown) => {
				const message = error instanceof Error ? error.message : 'unknown error'
				this.logger.error(`Membership notification failed: ${message}`)
			})
		}
	}
}
