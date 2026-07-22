export type BotHtmlValue = string | number

export type BotHtmlValues = Record<string, BotHtmlValue | undefined>

const ALLOWED_TAG_PATTERN = /<\/?(?:b|i|code)>/g
const HTML_TOKEN_PATTERN = /<\/?([a-z]+)>/g
const PLACEHOLDER_PATTERN = /\{(\w+)\}/g

function validateTrustedTemplate(template: string): void {
	const withoutAllowedTags = template.replace(ALLOWED_TAG_PATTERN, '')
	if (withoutAllowedTags.includes('<') || withoutAllowedTags.includes('>')) {
		throw new Error('Bot HTML templates may only use <b>, <i>, and <code> tags without attributes')
	}

	const openTags: string[] = []
	for (const match of template.matchAll(HTML_TOKEN_PATTERN)) {
		const token = match[0]
		const tag = match[1]
		if (token.startsWith('</')) {
			if (openTags.pop() !== tag) {
				throw new Error(`Bot HTML template has an unmatched closing <${tag}> tag`)
			}
			continue
		}
		openTags.push(tag)
	}

	if (openTags.length > 0) {
		throw new Error(`Bot HTML template has an unclosed <${openTags[openTags.length - 1]}> tag`)
	}
}

function escapeBotHtml(value: BotHtmlValue): string {
	return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/**
 * Renders a trusted catalog template for Telegram's HTML parse mode.
 *
 * Catalog markup is deliberately restricted to the three tags used by the bot.
 * Every runtime value is escaped and there is no raw-value escape hatch.
 */
export function renderBotHtml(template: string, values: BotHtmlValues = {}): string {
	validateTrustedTemplate(template)

	return template.replace(PLACEHOLDER_PATTERN, (_, key: string) => {
		const value = values[key]
		if (value === undefined) {
			throw new Error(`Missing bot HTML placeholder value: ${key}`)
		}
		return escapeBotHtml(value)
	})
}

export function withTelegramHtml(): { parse_mode: 'HTML' }
export function withTelegramHtml<T extends object>(options: T): T & { parse_mode: 'HTML' }
export function withTelegramHtml<T extends object>(options?: T): T & { parse_mode: 'HTML' } {
	return { ...(options ?? ({} as T)), parse_mode: 'HTML' }
}
