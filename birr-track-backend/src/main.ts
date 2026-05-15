import { Logger, ValidationError, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import helmet from 'helmet'
import { WinstonModule } from 'nest-winston'

import AppModule from './app.module'
import ValidationException from './shared/exceptions/validation.exception'
import winstonLoggerInstance from './shared/log/winston.log'

async function bootstrap() {
	const app = await NestFactory.create(AppModule, {
		logger: WinstonModule.createLogger({ instance: winstonLoggerInstance }),
	})

	// Helmet can help protect your app from some well-known web vulnerabilities by setting HTTP headers appropriately
	app.use(helmet())

	// Config service to access .env file
	const configService = app.get(ConfigService)

	// Logger to log stuff into console
	const logger = new Logger()

	// Enable CORS from allowed origins listed in .env
	app.enableCors({
		origin: configService.get<string>('CORS_ALLOWED_ORIGINS') ? configService.get<string>('CORS_ALLOWED_ORIGINS').split(',') : false,
	})

	// Add an 'api' prefix to all controller routes
	// app.setGlobalPrefix('api')

	// Register global pipes
	app.useGlobalPipes(
		// Register a validation pipe for 'class-validator' to work
		new ValidationPipe({
			whitelist: true, // Don't accept non-listed attributes
			transform: true, // Allow transformation
			forbidNonWhitelisted: true, // Throw an error if non-listed attributes are received

			// For every validation error create and throw a custom validation error
			// which is then handled by the global exception filter
			exceptionFactory: (validationErrors: ValidationError[] = []) => {
				return new ValidationException(validationErrors)
			},
		}),
	)

	// Starts listening for shutdown hooks
	app.enableShutdownHooks()

	// Swagger for API documentation
	const swaggerConfig = new DocumentBuilder().setTitle('Nest Template').setDescription('API Documentation').setVersion('1.0').build()
	const documentFactory = () => SwaggerModule.createDocument(app, swaggerConfig)
	SwaggerModule.setup('docs', app, documentFactory)

	await app.listen(configService.get('APP_PORT') ?? 3000, () => {
		app.getUrl()
			.then((url) => logger.verbose(`Application running at ${url}`))
			.catch((err) => logger.error(err))
	})
}

void bootstrap()
