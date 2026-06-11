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

type TelegramGetFileResponse = {
	ok?: boolean
	description?: string
	result?: { file_path?: string }
}

@Injectable()
export class ProcessingService {
	private readonly logger = new Logger(ProcessingService.name)

	constructor(
		private readonly configService: ConfigService,
		private readonly vlmService: VlmService,
		private readonly storageService: StorageService,
		private readonly transactionsService: TransactionsService,
		private readonly transactionEventsGateway: TransactionEventsGateway,
		private readonly usersService: UsersService,
	) {}

	async processImageJob(payload: ImageProcessingJobPayload): Promise<void> {
		this.logger.log(`Processing receipt for telegram user ${payload.telegramUserId}`)

		const user = await this.usersService.findByTelegramId(payload.telegramUserId)
		if (!user || !user.businessId) {
			this.logger.warn(`No active business membership for user ${payload.telegramUserId}; skipping processing`)
			return
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
			fileUrl = await this.resolveTelegramFileDownloadUrl(payload.fileId)
			imageBuffer = await this.downloadTelegramFileFromUrl(fileUrl)
			imageKey = await this.storageService.uploadReceiptImage(imageBuffer, payload.telegramUserId)

			parsed = await this.vlmService.extract(imageBuffer)
		} catch (err: unknown) {
			const errorMsg = err instanceof Error ? err.message : JSON.stringify(err)
			this.logger.error(`VLM processing failed for user ${payload.telegramUserId}: ${errorMsg}`)
		}

		const isComplete = parsed.amount !== null && parsed.transactionId !== null && parsed.timestamp !== null && parsed.bankName !== null
		const status = isComplete ? 'recorded' : 'needs_review'

		let duplicate = false
		if (isComplete && parsed.amount !== null && parsed.transactionId !== null && parsed.timestamp !== null) {
			const existingDuplicate = await this.transactionsService.findDuplicate(user.businessId, parsed.transactionId, parsed.amount, parsed.timestamp)
			duplicate = Boolean(existingDuplicate)
		}

		const createDto: CreateTransactionDto = {
			telegramUserId: payload.telegramUserId,
			telegramName: payload.telegramName,
			businessId: user.businessId,
			userId: user.id,
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
				this.logger.log(`Idempotent redelivery detected for file_unique_id ${payload.fileUniqueId}; transaction already exists`)
				return
			}
			throw error
		}
	}

	private async downloadTelegramFileFromUrl(fileUrl: string): Promise<Buffer> {
		try {
			const response = await axios.get<ArrayBuffer>(fileUrl, {
				responseType: 'arraybuffer',
				timeout: 30000,
			})
			return Buffer.from(response.data)
		} catch (err: unknown) {
			const ax = err as { response?: { status?: number; data?: unknown } }
			this.logger.warn(`Telegram file download failed HTTP ${ax.response?.status ?? 'n/a'}: ${this.stringifyAxiosBody(ax.response?.data)}`)
			throw err
		}
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
			timeout: 30000,
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
