import { Injectable } from '@nestjs/common'

/**
 * Placeholder update handler.
 * Actual bot handlers are in the ConversationService, ReceiptService, and RegistrationService classes,
 * which are @Update() decorated and will receive updates.
 */
@Injectable()
export class TelegramUpdateHandler {
	// Handlers moved to flows/* services
}
