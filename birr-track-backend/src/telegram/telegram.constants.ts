export const TELEGRAM_BOT_NAME = 'Birr Track Bot'
/** Dev-only fallback shared by the controller, webhook setup script, and smoke test. Set TELEGRAM_WEBHOOK_SECRET in production. */
export const DEFAULT_TELEGRAM_WEBHOOK_SECRET = 'default-webhook-secret'
export const TELEGRAM_SECRET_TOKEN_HEADER = 'x-telegram-bot-api-secret-token'
export const PHOTO_RATE_LIMIT_KEY_PREFIX = 'telegram:photo-rate:'
export const THROTTLED_MESSAGE = "You're sending receipts too quickly. Please wait a minute and try again."
export const DEFAULT_UNKNOWN_TELEGRAM_USER = 'Unknown User'
export const WELCOME_MESSAGE = 'Welcome to Birr Track Bot'

export const BOT_SHORT_DESCRIPTION = 'Submit payment Receipts and track Business Transactions from Telegram.'
export const BOT_DESCRIPTION =
	'Birr Track helps business owners or managers to track their credit receipts. It can be for items sold, services provided; you name it. Waiters submit payment receipts and managers or owners review work in their respective admin panel. Register a business, invite waiters or managers, and send receipt photos to keep transactions recorded.'

export const WELCOME_MESSAGE_REGISTERED = 'Welcome back to {businessName}! Use the menu below or send /help for options.'
export const REGISTER_OR_INVITE_MESSAGE = "You're not registered yet. Send /register to create a business, or ask your manager for an invite."
export const REGISTER_SUCCESS_MESSAGE = "Thank you! Your business registration has been submitted for approval. We'll notify you when it's ready."
export const WELCOME_MESSAGE_PLATFORM_OWNER = '👋 Welcome, Platform Owner. Open the admin panel below to review business registrations and manage businesses.'

export const HELP_MESSAGE_UNKNOWN = [
	'Birr Track helps Businesses record payment Receipts from Telegram.',
	'',
	'Commands:',
	'/start - Start or refresh your Birr Track session.',
	'/help - Show what this bot can do.',
	'/register - Register a Business as its Owner.',
	'',
	'If your Business already uses Birr Track, ask a Manager or Owner to invite you.',
].join('\n')

export const HELP_MESSAGE_WAITER = [
	'Birr Track records your Business payment Receipts.',
	'',
	'What you can do:',
	'- Send a Receipt photo here to create a Transaction.',
	'- Open the Admin Panel from the bot menu when you need to review Transactions.',
	'',
	'Commands:',
	'/start - Refresh your menu.',
	'/help - Show this help message.',
].join('\n')

export const HELP_MESSAGE_MANAGER = [
	'Birr Track records your Business payment Receipts and helps Managers review Transactions.',
	'',
	'What you can do:',
	'- Send a Receipt photo here to create a Transaction.',
	'- Open the Admin Panel from the bot menu to review Transactions and manage Waiters.',
	'- Use /invite to invite Waiters to your Business.',
	'',
	'Commands:',
	'/start - Refresh your menu.',
	'/help - Show this help message.',
	'/invite - Invite a Waiter.',
].join('\n')

export const HELP_MESSAGE_OWNER = [
	'Birr Track records your Business payment Receipts and helps Owners manage their Business.',
	'',
	'What you can do:',
	'- Send a Receipt photo here to create a Transaction.',
	'- Open the Admin Panel from the bot menu to review Transactions and manage Waiters.',
	'- Use /invite to invite Waiters or Managers to your Business.',
	'',
	'Commands:',
	'/start - Refresh your menu.',
	'/help - Show this help message.',
	'/invite - Invite a Waiter or Manager.',
].join('\n')

export const HELP_MESSAGE_PLATFORM_OWNER = [
	'Birr Track lets the Platform Owner review Business registrations and oversee Businesses.',
	'',
	'What you can do:',
	'- Open the Admin Panel from the bot menu or the /start button.',
	'- Approve or reject Business registrations.',
	'',
	'Commands:',
	'/start - Show the Admin Panel button.',
	'/help - Show this help message.',
].join('\n')

export const INVITE_ROLE_BUTTONS: Record<'manager' | 'owner', Array<'waiter' | 'manager'>> = {
	manager: ['waiter'],
	owner: ['waiter', 'manager'],
}
