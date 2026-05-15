import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Job, Worker } from 'bullmq'
import IORedis from 'ioredis'

import { ProcessingService } from '../processing/processing.service'
import { DEFAULT_REDIS_PORT, IMAGE_PROCESSING_QUEUE } from './queue.constants'
import { ImageProcessingJobPayload } from './types/image-processing-job.type'

function describeWorkerError(error: unknown): string {
	if (error instanceof Error && error.message) {
		return error.message
	}
	if (typeof error === 'string') {
		return error
	}
	try {
		return JSON.stringify(error)
	} catch {
		return String(error)
	}
}

@Injectable()
export class ImageProcessingWorker implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(ImageProcessingWorker.name)
	private readonly redis: IORedis
	private worker: Worker<ImageProcessingJobPayload> | null = null

	constructor(
		private readonly configService: ConfigService,
		private readonly processingService: ProcessingService,
	) {
		this.redis = new IORedis({
			host: this.configService.get<string>('REDIS_HOST', '127.0.0.1'),
			port: Number(this.configService.get<string>('REDIS_PORT', `${DEFAULT_REDIS_PORT}`)),
			maxRetriesPerRequest: null,
		})
	}

	onModuleInit(): void {
		this.worker = new Worker<ImageProcessingJobPayload>(
			IMAGE_PROCESSING_QUEUE,
			async (job: Job<ImageProcessingJobPayload>) => {
				await this.processingService.processImageJob(job.data)
			},
			{
				connection: this.redis,
				concurrency: 2,
			},
		)

		this.worker.on('completed', (job) => {
			this.logger.log(`Processed queue job ${job.id}`)
		})

		this.worker.on('failed', (job, error) => {
			const description = describeWorkerError(error)
			const stack = error instanceof Error ? error.stack : undefined
			this.logger.error(`Queue job ${job?.id ?? 'unknown'} failed: ${description}`, stack)
		})
	}

	async onModuleDestroy(): Promise<void> {
		if (this.worker) {
			await this.worker.close()
		}
		await this.redis.quit()
	}
}
