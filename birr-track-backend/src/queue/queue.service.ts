import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JobsOptions, Queue } from 'bullmq'
import IORedis from 'ioredis'

import { DEFAULT_REDIS_PORT, IMAGE_PROCESSING_JOB, IMAGE_PROCESSING_QUEUE } from './queue.constants'
import { ImageProcessingJobPayload } from './types/image-processing-job.type'

const DEFAULT_JOB_OPTIONS: JobsOptions = {
	attempts: 3,
	removeOnComplete: 1000,
	removeOnFail: 2000,
	backoff: {
		type: 'exponential',
		delay: 3000,
	},
}

@Injectable()
export class QueueService implements OnModuleDestroy {
	private readonly logger = new Logger(QueueService.name)
	private readonly redis: IORedis
	private readonly imageProcessingQueue: Queue<ImageProcessingJobPayload>

	constructor(private readonly configService: ConfigService) {
		this.redis = new IORedis({
			host: this.configService.get<string>('REDIS_HOST', '127.0.0.1'),
			port: Number(this.configService.get<string>('REDIS_PORT', `${DEFAULT_REDIS_PORT}`)),
			maxRetriesPerRequest: null,
		})

		this.imageProcessingQueue = new Queue<ImageProcessingJobPayload>(IMAGE_PROCESSING_QUEUE, {
			connection: this.redis,
			defaultJobOptions: DEFAULT_JOB_OPTIONS,
		})
	}

	async enqueueImageProcessingJob(payload: ImageProcessingJobPayload): Promise<void> {
		await this.imageProcessingQueue.add(IMAGE_PROCESSING_JOB, payload)
		this.logger.log(`Queued image processing for telegram user ${payload.telegramUserId}`)
	}

	async onModuleDestroy(): Promise<void> {
		await this.imageProcessingQueue.close()
		await this.redis.quit()
	}
}
