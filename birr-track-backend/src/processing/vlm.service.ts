import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'

import { ParsedTransaction } from './types/parsed-transaction.type'

const DEFAULT_VLM_REQUEST_TIMEOUT_MS = 120000

type VlmExtractResponse = {
	bankName?: string | null
	amount?: number | string | null
	transactionId?: string | null
	timestamp?: string | null
	currency?: string | null
	confidence?: number | null
}

type RunPodSyncResponse = {
	id: string
	status: string
	output?: VlmExtractResponse & { error?: string }
	error?: string
}

@Injectable()
export class VlmService {
	private readonly logger = new Logger(VlmService.name)

	constructor(private readonly configService: ConfigService) {}

	async extract(imageBuffer: Buffer): Promise<ParsedTransaction> {
		const apiKey = this.configService.get<string>('RUNPOD_API_KEY')?.trim()
		const endpointId = this.configService.get<string>('RUNPOD_ENDPOINT_ID')?.trim()

		if (!apiKey || !endpointId) {
			throw new Error('RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID must be configured')
		}

		const timeoutMs = this.getRequestTimeoutMs()
		const imageBase64 = imageBuffer.toString('base64')

		const response = await axios.post<RunPodSyncResponse>(
			`https://api.runpod.ai/v2/${endpointId}/runsync`,
			{ input: { image_base64: imageBase64 } },
			{
				headers: {
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
				},
				timeout: timeoutMs,
			},
		)

		const { status, output, error } = response.data

		if (status !== 'COMPLETED' || error) {
			throw new Error(`RunPod job failed: status=${status} error=${error ?? output?.error}`)
		}

		const parsed = this.normalizeResponse(output)
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
