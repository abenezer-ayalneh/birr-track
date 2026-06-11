import 'dotenv/config'

import axios from 'axios'

import { DEFAULT_TELEGRAM_WEBHOOK_SECRET, TELEGRAM_SECRET_TOKEN_HEADER } from '../telegram/telegram.constants'

const DEFAULT_TIMEOUT_MS = 120000
const POLL_INTERVAL_MS = 3000
const HEALTH_POLL_INTERVAL_MS = 2000

function defaultLocalAppBaseUrl(): string {
	const port = Number(process.env.PORT) || 3000
	return `http://127.0.0.1:${port}`
}

type TransactionsResponse = {
	page: number
	limit: number
	total: number
	items: Array<{
		id: string
		telegramUserId: string
		createdAt: string
	}>
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

function getEnv(name: string): string | undefined {
	const value = process.env[name]?.trim()
	return value ? value : undefined
}

function getRequiredEnv(name: string): string {
	const value = getEnv(name)
	if (!value) {
		throw new Error(`${name} is required`)
	}
	return value
}

function normalizeBaseUrl(url: string): string {
	return url.endsWith('/') ? url.slice(0, -1) : url
}

function resolveBaseUrlTemplate(url: string): string {
	const port = String(Number(process.env.PORT) || 3000)
	return url.replaceAll('${PORT}', port)
}

async function main(): Promise<void> {
	const configuredBaseUrl = getEnv('SMOKE_APP_BASE_URL') || getEnv('APP_BASE_URL')
	const appBaseUrl = normalizeBaseUrl(resolveBaseUrlTemplate(configuredBaseUrl || defaultLocalAppBaseUrl()))
	const waitForBackendMs = Number(getEnv('SMOKE_WAIT_FOR_BACKEND_MS') ?? '0')
	const fileId = getRequiredEnv('SMOKE_TELEGRAM_FILE_ID')
	const timeoutMs = Number(getEnv('SMOKE_TIMEOUT_MS') || DEFAULT_TIMEOUT_MS)
	const secret = getEnv('TELEGRAM_WEBHOOK_SECRET') || DEFAULT_TELEGRAM_WEBHOOK_SECRET
	const telegramUserId = `99${Date.now()}`
	const telegramName = 'Smoke Test User'
	const startTime = Date.now()

	console.log('Starting E2E smoke test')
	console.log(`- App URL: ${appBaseUrl}`)
	console.log(`- URL source: ${configuredBaseUrl ? 'environment variable' : 'PORT-based local fallback'}`)
	if (waitForBackendMs > 0) {
		console.log(`- Backend wait: up to ${waitForBackendMs}ms for GET /health (SMOKE_WAIT_FOR_BACKEND_MS)`)
	}
	console.log(`- Telegram user id: ${telegramUserId}`)
	console.log(`- Timeout: ${timeoutMs}ms`)

	const healthWaitDeadline = Date.now() + waitForBackendMs
	let healthStatus: number | null

	for (;;) {
		healthStatus = null
		try {
			const healthResponse = await axios.get(`${appBaseUrl}/health`, {
				timeout: 10000,
			})
			healthStatus = healthResponse.status
		} catch {
			// health probe failed; healthStatus stays null
		}

		if (healthStatus === 200) {
			break
		}

		const pastDeadline = Date.now() > healthWaitDeadline
		if (pastDeadline || waitForBackendMs <= 0) {
			throw new Error(
				`Backend is not reachable at ${appBaseUrl}. Start the API first (e.g. npm run start:dev). ` +
					`If the server starts in parallel, set SMOKE_WAIT_FOR_BACKEND_MS=120000 in .env.`,
			)
		}

		await sleep(HEALTH_POLL_INTERVAL_MS)
	}

	await axios.post(
		`${appBaseUrl}/telegram/webhook/${secret}`,
		{
			message: {
				from: {
					id: Number(telegramUserId),
					first_name: 'Smoke',
					last_name: 'Test',
				},
				photo: [
					{
						file_id: fileId,
						file_unique_id: 'smoke-file-uid',
						width: 1280,
						height: 960,
					},
				],
			},
		},
		{
			headers: { [TELEGRAM_SECRET_TOKEN_HEADER]: secret },
		},
	)

	console.log('Webhook accepted. Polling transactions endpoint...')

	let createdTransactionId: string | null = null
	while (Date.now() - startTime < timeoutMs) {
		const response = await axios.get<TransactionsResponse>(`${appBaseUrl}/transactions`, {
			params: {
				page: 1,
				limit: 20,
				telegramUserId,
			},
		})

		const recentMatch = response.data.items.find((item) => {
			return item.telegramUserId === telegramUserId && new Date(item.createdAt).getTime() >= startTime
		})

		if (recentMatch) {
			createdTransactionId = recentMatch.id
			break
		}

		await sleep(POLL_INTERVAL_MS)
	}

	if (!createdTransactionId) {
		throw new Error('Timed out waiting for processed transaction. Check worker and VLM service logs.')
	}

	const summaryResponse = await axios.get<{
		totalRevenue: number
		transactionCount: number
	}>(`${appBaseUrl}/transactions/summary`, {
		params: { telegramUserId },
	})

	console.log('Smoke test passed')
	console.log(`- Created transaction id: ${createdTransactionId}`)
	console.log(`- Summary count: ${summaryResponse.data.transactionCount}`)
	console.log(`- Summary revenue: ${summaryResponse.data.totalRevenue}`)
	console.log(`- Display name used: ${telegramName}`)
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : 'Unknown error'
	const axiosError = error as {
		response?: { status?: number; data?: unknown }
		config?: { url?: string; baseURL?: string; method?: string }
		code?: string
	}
	console.error(`Smoke test failed: ${message}`)
	console.error(`Debug details: code=${axiosError?.code ?? 'n/a'} status=${axiosError?.response?.status ?? 'n/a'} url=${axiosError?.config?.url ?? 'n/a'}`)
	process.exit(1)
})
