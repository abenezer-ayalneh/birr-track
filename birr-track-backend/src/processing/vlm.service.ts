import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'
import FormData from 'form-data'

import { ParsedTransaction } from './types/parsed-transaction.type'

const DEFAULT_VLM_REQUEST_TIMEOUT_MS = 120000
const RECEIPT_FILENAME = 'receipt.jpg'
const RECEIPT_CONTENT_TYPE = 'image/jpeg'

type VlmExtractResponse = {
	bankName?: string | null
	amount?: number | string | null
	transactionId?: string | null
	timestamp?: string | null
	currency?: string | null
	confidence?: number | null
}

/**
 * HTTP client for the fine-tuned Qwen2.5-VL inference service.
 *
 * Replaces the previous OCR + regex + LLM fallback pipeline with a single
 * vision-language model call that returns structured transaction fields.
 *
 * The Python inference service is a follow-up deliverable; until it is online,
 * this client will fail loudly at runtime.
 */
@Injectable()
export class VlmService {
	private readonly logger = new Logger(VlmService.name)

	constructor(private readonly configService: ConfigService) {}

	async extract(imageBuffer: Buffer): Promise<ParsedTransaction> {
		const baseUrl = this.configService.get<string>('VLM_SERVICE_URL')?.trim()
		if (!baseUrl) {
			throw new Error('VLM_SERVICE_URL is not configured')
		}

		const formData = new FormData()
		formData.append('file', imageBuffer, {
			filename: RECEIPT_FILENAME,
			contentType: RECEIPT_CONTENT_TYPE,
		})

		const timeoutMs = this.getRequestTimeoutMs()

		const response = await axios.post<VlmExtractResponse>(`${baseUrl}/extract`, formData, {
			headers: formData.getHeaders(),
			timeout: timeoutMs,
		})

		const parsed = this.normalizeResponse(response.data)
		this.logger.debug(`VLM extract confidence=${parsed.confidence}`)
		return parsed
	}

	private normalizeResponse(data: VlmExtractResponse | undefined): ParsedTransaction {
		const amount = this.parseAmount(data?.amount)
		const confidence = typeof data?.confidence === 'number' && Number.isFinite(data.confidence) ? data.confidence : 0

		return {
			bankName: this.nonEmptyString(data?.bankName),
			amount,
			transactionId: this.nonEmptyString(data?.transactionId),
			timestamp: this.nonEmptyString(data?.timestamp),
			currency: this.nonEmptyString(data?.currency),
			confidence,
		}
	}

	private parseAmount(value: VlmExtractResponse['amount']): number | null {
		if (typeof value === 'number' && Number.isFinite(value)) {
			return value
		}
		if (typeof value === 'string' && value.trim() !== '') {
			const parsed = Number(value.replaceAll(',', ''))
			return Number.isFinite(parsed) ? parsed : null
		}
		return null
	}

	private getRequestTimeoutMs(): number {
		const raw = this.configService.get<string>('VLM_REQUEST_TIMEOUT_MS')?.trim()
		if (!raw) {
			return DEFAULT_VLM_REQUEST_TIMEOUT_MS
		}
		const parsed = Number(raw)
		return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_VLM_REQUEST_TIMEOUT_MS
	}

	private nonEmptyString(value: string | null | undefined): string | null {
		if (typeof value !== 'string') {
			return null
		}
		const trimmed = value.trim()
		return trimmed === '' ? null : trimmed
	}
}
