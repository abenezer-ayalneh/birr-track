export const TELEGRAM_BOT_NAME = 'Birr Track Bot'
/** Dev-only fallback shared by the controller, webhook setup script, and smoke test. Set TELEGRAM_WEBHOOK_SECRET in production. */
export const DEFAULT_TELEGRAM_WEBHOOK_SECRET = 'default-webhook-secret'
export const TELEGRAM_SECRET_TOKEN_HEADER = 'x-telegram-bot-api-secret-token'
export const PHOTO_RATE_LIMIT_KEY_PREFIX = 'telegram:photo-rate:'
export const THROTTLED_MESSAGE = "You're sending receipts too quickly. Please wait a minute and try again."
export const DEFAULT_UNKNOWN_TELEGRAM_USER = 'Unknown User'
export const WELCOME_MESSAGE = 'Welcome to Birr Track Bot'

export const WELCOME_MESSAGE_REGISTERED = 'Welcome back to {businessName}! Use the menu below or send /help for options.'
export const REGISTER_OR_INVITE_MESSAGE = "You're not registered yet. Send /register to create a business, or ask your manager for an invite."
export const REGISTER_SUCCESS_MESSAGE = "Thank you! Your business registration has been submitted for approval. We'll notify you when it's ready."
export const WELCOME_MESSAGE_PLATFORM_OWNER = '👋 Welcome, Platform Owner. Open the admin panel below to review business registrations and manage businesses.'

export const INVITE_ROLE_BUTTONS: Record<'manager' | 'owner', Array<'waiter' | 'manager'>> = {
	manager: ['waiter'],
	owner: ['waiter', 'manager'],
}
