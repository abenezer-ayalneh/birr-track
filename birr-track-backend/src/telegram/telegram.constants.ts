export const TELEGRAM_BOT_NAME = 'Birr Track Bot'
/** Dev-only fallback shared by the controller, webhook setup script, and smoke test. Set TELEGRAM_WEBHOOK_SECRET in production. */
export const DEFAULT_TELEGRAM_WEBHOOK_SECRET = 'default-webhook-secret'
export const TELEGRAM_SECRET_TOKEN_HEADER = 'x-telegram-bot-api-secret-token'
export const PHOTO_RATE_LIMIT_KEY_PREFIX = 'telegram:photo-rate:'

export const INVITE_ROLE_BUTTONS: Record<'manager' | 'owner', Array<'waiter' | 'manager'>> = {
	manager: ['waiter'],
	owner: ['waiter', 'manager'],
}
