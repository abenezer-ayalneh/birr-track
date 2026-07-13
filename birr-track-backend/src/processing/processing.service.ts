import * as https from 'node:https'

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'

import { ImageProcessingJobPayload } from '../queue/types/image-processing-job.type'
import { StorageService } from '../storage/storage.service'
import { CreateTransactionDto } from '../transactions/dto/create-transaction.dto'
import { TransactionsService } from '../transactions/transactions.service'
import { UsersService } from '../users/users.service'
import { TransactionEventsGateway } from '../websocket/transaction-events.gateway'
import { VlmService } from './vlm.service'

const DEFAULT_TELEGRAM_FILE_TIMEOUT_MS = 30000
const TELEGRAM_FILE_DOWNLOAD_ATTEMPTS = 3
const TELEGRAM_FILE_DOWNLOAD_RETRY_DELAY_MS = 750
const TELEGRAM_FILE_DOWNLOAD_MAX_REDIRECTS = 3

type TelegramGetFileResponse = {
	ok?: boolean
	description?: string
	result?: { file_path?: string }
}

@Injectable()
export class ProcessingService {
	private readonly logger = new Logger(ProcessingService.name)
	private readonly telegramFileTimeoutMs: number
	private readonly telegramFileDownloadAgent = new https.Agent({ family: 4, keepAlive: false })

	constructor(
		private readonly configService: ConfigService,
		private readonly vlmService: VlmService,
		private readonly storageService: StorageService,
		private readonly transactionsService: TransactionsService,
		private readonly transactionEventsGateway: TransactionEventsGateway,
		private readonly usersService: UsersService,
	) {
		const raw = Number(this.configService.get<string>('TELEGRAM_FILE_DOWNLOAD_TIMEOUT_MS'))
		this.telegramFileTimeoutMs = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TELEGRAM_FILE_TIMEOUT_MS
	}

	async processImageJob(payload: ImageProcessingJobPayload): Promise<void> {
		this.logger.log(`Processing receipt for telegram user ${payload.telegramUserId}`)

		// Receipt acceptance captures the membership identity. Use it even after a
		// departure so an acknowledged receipt cannot be dropped or attributed to a
		// later Business membership. Legacy queue jobs still use the active lookup.
		let userId = payload.userId
		let businessId = payload.businessId
		if (!userId || !businessId) {
			const user = await this.usersService.findByTelegramId(payload.telegramUserId)
			if (!user || !user.businessId) {
				this.logger.warn(`No active business membership for user ${payload.telegramUserId}; skipping legacy processing job`)
				return
			}
			userId = user.id
			businessId = user.businessId
		}

		let fileUrl: string
		let imageBuffer: Buffer
		let imageKey: string | null = null
		let parsed: { amount: number | null; transactionId: string | null; timestamp: string | null; bankName: string | null; confidence: number } = {
			amount: null,
			transactionId: null,
			timestamp: null,
			bankName: null,
			confidence: 0,
		}

		try {
			fileUrl = await this.runProcessingStage('telegram_get_file', payload.telegramUserId, () => this.resolveTelegramFileDownloadUrl(payload.fileId))
			imageBuffer = await this.runProcessingStage('telegram_download_file', payload.telegramUserId, () => this.downloadTelegramFileFromUrl(fileUrl))
			imageKey = await this.runProcessingStage('storage_upload_receipt', payload.telegramUserId, () =>
				this.storageService.uploadReceiptImage(imageBuffer, payload.telegramUserId),
			)

			parsed = await this.runProcessingStage('vlm_extract_receipt', payload.telegramUserId, () => this.vlmService.extract(imageBuffer))
		} catch (err: unknown) {
			const errorMsg = err instanceof Error ? err.message : JSON.stringify(err)
			this.logger.error(`Receipt processing failed for user ${payload.telegramUserId}: ${errorMsg}`)
		}

		const isComplete = parsed.amount !== null && parsed.transactionId !== null && parsed.timestamp !== null && parsed.bankName !== null
		const status = isComplete ? 'recorded' : 'needs_review'

		let duplicate = false
		if (isComplete && parsed.amount !== null && parsed.transactionId !== null && parsed.timestamp !== null) {
			const existingDuplicate = await this.transactionsService.findDuplicate(businessId, parsed.transactionId, parsed.amount, parsed.timestamp)
			duplicate = Boolean(existingDuplicate)
		}

		const createDto: CreateTransactionDto = {
			telegramUserId: payload.telegramUserId,
			telegramName: payload.telegramName,
			businessId,
			userId,
			amount: parsed.amount ?? undefined,
			transactionId: parsed.transactionId ?? undefined,
			timestamp: parsed.timestamp ?? undefined,
			bankName: parsed.bankName ?? undefined,
			confidence: parsed.confidence,
			isDuplicate: duplicate,
			imageKey: imageKey ?? undefined,
			fileUniqueId: payload.fileUniqueId,
		}

		try {
			const transaction = await this.transactionsService.create(createDto, status)
			this.transactionEventsGateway.emitTransactionNew({
				...transaction,
				amount: transaction.amount !== null ? Number(transaction.amount) : null,
			})
		} catch (error: unknown) {
			if (error instanceof Error && error.message.includes('duplicate key')) {
				const repaired = await this.transactionsService.repairIdempotentRedelivery(createDto, status)
				if (repaired) {
					this.transactionEventsGateway.emitTransactionNew({
						...repaired,
						amount: repaired.amount !== null ? Number(repaired.amount) : null,
					})
					this.logger.log(`Idempotent redelivery repaired transaction ${repaired.id} for file_unique_id ${payload.fileUniqueId}`)
					return
				}
				this.logger.log(`Idempotent redelivery detected for file_unique_id ${payload.fileUniqueId}; transaction already exists`)
				return
			}
			throw error
		}
	}

	private async runProcessingStage<T>(stage: string, telegramUserId: string, operation: () => Promise<T>): Promise<T> {
		try {
			const result = await operation()
			this.logger.debug(`Receipt processing stage succeeded: ${stage} user=${telegramUserId}`)
			return result
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : JSON.stringify(error)
			throw new Error(`${stage}: ${message}`)
		}
	}

	private async downloadTelegramFileFromUrl(fileUrl: string): Promise<Buffer> {
		let lastError: unknown

		for (let attempt = 1; attempt <= TELEGRAM_FILE_DOWNLOAD_ATTEMPTS; attempt++) {
			try {
				return await this.downloadTelegramFileOnce(fileUrl)
			} catch (error: unknown) {
				lastError = error
				const message = error instanceof Error ? error.message : JSON.stringify(error)
				const retryable = this.isRetriableTelegramDownloadError(error)
				this.logger.warn(`Telegram file download attempt ${attempt}/${TELEGRAM_FILE_DOWNLOAD_ATTEMPTS} failed: ${message}`)

				if (!retryable || attempt === TELEGRAM_FILE_DOWNLOAD_ATTEMPTS) {
					break
				}

				await this.sleep(TELEGRAM_FILE_DOWNLOAD_RETRY_DELAY_MS * attempt)
			}
		}

		const finalMessage = lastError instanceof Error ? lastError.message : JSON.stringify(lastError)
		throw new Error(`Telegram file download failed after ${TELEGRAM_FILE_DOWNLOAD_ATTEMPTS} attempt(s): ${finalMessage}`)
	}

	private async downloadTelegramFileOnce(fileUrl: string, redirectsRemaining = TELEGRAM_FILE_DOWNLOAD_MAX_REDIRECTS): Promise<Buffer> {
		return new Promise<Buffer>((resolve, reject) => {
			const requestUrl = new URL(fileUrl)
			const request = https.get(requestUrl, { agent: this.telegramFileDownloadAgent, family: 4 }, (response) => {
				const statusCode = response.statusCode ?? 0
				const chunks: Buffer[] = []

				this.logger.debug(`Telegram file download response: status=${statusCode}, host=${requestUrl.hostname}`)

				if (this.isRedirectStatus(statusCode)) {
					const location = response.headers.location
					response.resume()

					if (!location) {
						reject(new Error(`Telegram file download redirect ${statusCode} without location`))
						return
					}

					if (redirectsRemaining <= 0) {
						reject(new Error(`Telegram file download exceeded redirect limit at status ${statusCode}`))
						return
					}

					const redirectedUrl = new URL(location, requestUrl)
					this.downloadTelegramFileOnce(redirectedUrl.toString(), redirectsRemaining - 1).then(resolve, reject)
					return
				}

				response.on('data', (chunk: Buffer | string) => {
					chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
				})

				response.on('end', () => {
					const body = Buffer.concat(chunks)
					if (statusCode < 200 || statusCode >= 300) {
						reject(new Error(`Telegram file download HTTP ${statusCode}: ${this.stringifyAxiosBody(body)}`))
						return
					}
					resolve(body)
				})

				response.on('aborted', () => {
					reject(new Error('Telegram file download stream aborted'))
				})

				response.on('error', (error) => {
					reject(error)
				})
			})

			request.on('socket', (socket) => {
				socket.on('lookup', (_error, address, family) => {
					this.logger.debug(`Telegram file download DNS resolved: family=${family}, address=${address}`)
				})
				socket.on('connect', () => {
					this.logger.debug('Telegram file download TCP connected')
				})
				socket.on('secureConnect', () => {
					this.logger.debug('Telegram file download TLS connected')
				})
			})

			request.setTimeout(this.telegramFileTimeoutMs, () => {
				request.destroy(new Error(`Telegram file download timed out after ${this.telegramFileTimeoutMs}ms`))
			})

			request.on('error', (error) => {
				reject(error)
			})
		})
	}

	private isRedirectStatus(statusCode: number): boolean {
		return statusCode === 301 || statusCode === 302 || statusCode === 303 || statusCode === 307 || statusCode === 308
	}

	private isRetriableTelegramDownloadError(error: unknown): boolean {
		const message = error instanceof Error ? error.message : JSON.stringify(error)
		return /aborted|timeout|timed out|ECONNRESET|ETIMEDOUT|socket hang up/i.test(message)
	}

	private async sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}

	/**
	 * Telegram getFile often returns HTTP 400 with JSON { ok: false, description } (e.g. invalid file_id).
	 * Default axios behavior hides `description` behind a generic AxiosError.
	 */
	private async resolveTelegramFileDownloadUrl(fileId: string): Promise<string> {
		const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN')?.trim()
		if (!token) {
			throw new Error('TELEGRAM_BOT_TOKEN is not configured')
		}

		const trimmedFileId = fileId.trim()
		if (!trimmedFileId) {
			throw new Error('Telegram file_id is empty')
		}

		const response = await axios.get<TelegramGetFileResponse>(`https://api.telegram.org/bot${token}/getFile`, {
			params: { file_id: trimmedFileId },
			timeout: this.telegramFileTimeoutMs,
			validateStatus: () => true,
		})

		const data = response.data
		const filePath = data?.result?.file_path

		if (response.status === 200 && data?.ok === true && filePath) {
			return `https://api.telegram.org/file/bot${token}/${filePath}`
		}

		const telegramMessage = typeof data?.description === 'string' ? data.description : this.stringifyAxiosBody(data)
		const hint = 'Ensure TELEGRAM_BOT_TOKEN is the same bot that received the photo; file_id values are not portable across bots.'

		this.logger.error(`Telegram getFile failed (HTTP ${response.status}): ${telegramMessage}. file_id length=${trimmedFileId.length}. ${hint}`)

		throw new Error(`Telegram getFile failed (HTTP ${response.status}): ${telegramMessage}. ${hint}`)
	}

	private stringifyAxiosBody(data: unknown): string {
		if (data == null) {
			return '(empty body)'
		}
		if (typeof data === 'string') {
			return data.slice(0, 500)
		}
		if (Buffer.isBuffer(data)) {
			return '[binary]'
		}
		try {
			return JSON.stringify(data).slice(0, 500)
		} catch {
			return '[unserializable body]'
		}
	}
}
