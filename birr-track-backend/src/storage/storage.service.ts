import { randomUUID } from 'node:crypto'

import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Readable } from 'stream'

@Injectable()
export class StorageService implements OnModuleInit {
	private readonly logger = new Logger(StorageService.name)
	private readonly s3Client: S3Client
	private readonly bucket: string

	constructor(private readonly configService: ConfigService) {
		this.bucket = this.configService.get<string>('STORAGE_BUCKET', 'birr-track-receipts')
		this.s3Client = new S3Client({
			endpoint: this.configService.get<string>('STORAGE_ENDPOINT', 'http://localhost:9000'),
			region: this.configService.get<string>('STORAGE_REGION', 'us-east-1'),
			// MinIO and most self-hosted S3 gateways do not support virtual-hosted bucket addressing
			forcePathStyle: this.configService.get<string>('STORAGE_FORCE_PATH_STYLE', 'true') !== 'false',
			credentials: {
				accessKeyId: this.configService.get<string>('STORAGE_ACCESS_KEY', 'minioadmin'),
				secretAccessKey: this.configService.get<string>('STORAGE_SECRET_KEY', 'minioadmin'),
			},
		})
	}

	async onModuleInit(): Promise<void> {
		try {
			await this.ensureBucketExists()
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'unknown error'
			this.logger.warn(`Could not verify bucket "${this.bucket}" at startup (uploads will fail until storage is reachable): ${message}`)
		}
	}

	/** Uploads a receipt image and returns its object key — the only value callers should persist. */
	async uploadReceiptImage(imageBuffer: Buffer, telegramUserId: string): Promise<string> {
		const now = new Date()
		const year = now.getUTCFullYear()
		const month = String(now.getUTCMonth() + 1).padStart(2, '0')
		const objectKey = `receipts/${year}/${month}/${telegramUserId}-${randomUUID()}.jpg`

		await this.s3Client.send(
			new PutObjectCommand({
				Bucket: this.bucket,
				Key: objectKey,
				Body: imageBuffer,
				ContentType: 'image/jpeg',
			}),
		)

		this.logger.log(`Uploaded receipt image ${objectKey}`)
		return objectKey
	}

	/** Retrieves an object from storage as a readable stream. */
	async getObjectStream(objectKey: string): Promise<Readable> {
		const response = await this.s3Client.send(new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }))
		return response.Body as Readable
	}

	private async ensureBucketExists(): Promise<void> {
		try {
			await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }))
		} catch (error: unknown) {
			const statusCode = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
			if (statusCode !== 404) {
				throw error
			}
			await this.s3Client.send(new CreateBucketCommand({ Bucket: this.bucket }))
			this.logger.log(`Created bucket "${this.bucket}"`)
		}
	}
}
