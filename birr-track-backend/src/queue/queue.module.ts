import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { ProcessingModule } from '../processing/processing.module'
import { ImageProcessingWorker } from './image-processing.worker'
import { QueueService } from './queue.service'

@Module({
	imports: [ConfigModule, ProcessingModule],
	providers: [QueueService, ImageProcessingWorker],
	exports: [QueueService],
})
export class QueueModule {}
