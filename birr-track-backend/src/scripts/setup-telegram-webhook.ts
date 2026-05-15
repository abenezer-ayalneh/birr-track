import 'dotenv/config'

import axios from 'axios'

const TELEGRAM_API_BASE = 'https://api.telegram.org'

type TelegramApiResponse<T> = {
	ok: boolean
	result?: T
	description?: string
}

function getRequiredEnv(name: string): string {
	const value = process.env[name]?.trim()
	if (!value) {
		throw new Error(`${name} is required`)
	}
	return value
}

function normalizeUrl(value: string): string {
	return value.endsWith('/') ? value.slice(0, -1) : value
}

async function main(): Promise<void> {
	const token = getRequiredEnv('TELEGRAM_BOT_TOKEN')
	const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || 'default-webhook-secret'
	const baseUrl = normalizeUrl(process.env.TELEGRAM_WEBHOOK_BASE_URL?.trim() || process.env.APP_BASE_URL?.trim() || '')

	if (!baseUrl) {
		throw new Error('Set TELEGRAM_WEBHOOK_BASE_URL or APP_BASE_URL before running this script')
	}

	const webhookUrl = `${baseUrl}/telegram/webhook/${secret}`
	const setWebhookUrl = `${TELEGRAM_API_BASE}/bot${token}/setWebhook`
	const webhookInfoUrl = `${TELEGRAM_API_BASE}/bot${token}/getWebhookInfo`

	const setResponse = await axios.post<TelegramApiResponse<true>>(setWebhookUrl, {
		url: webhookUrl,
		drop_pending_updates: true,
	})

	if (!setResponse.data.ok) {
		throw new Error(setResponse.data.description || 'Failed to set webhook')
	}

	const infoResponse = await axios.get<
		TelegramApiResponse<{
			url: string
			pending_update_count: number
			last_error_date?: number
			last_error_message?: string
		}>
	>(webhookInfoUrl)

	if (!infoResponse.data.ok || !infoResponse.data.result) {
		throw new Error('Webhook configured but getWebhookInfo failed')
	}

	const info = infoResponse.data.result
	console.log('Webhook setup succeeded')
	console.log(`- URL: ${info.url}`)
	console.log(`- Pending updates: ${info.pending_update_count}`)
	if (info.last_error_message) {
		console.log(`- Last error: ${info.last_error_message}`)
	}
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : 'Unknown error'
	console.error(`Webhook setup failed: ${message}`)
	process.exit(1)
})
