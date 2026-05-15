import 'winston-daily-rotate-file'

import { utilities as nestWinstonModuleUtilities } from 'nest-winston' // Custom log display format
import { createLogger, format, LoggerOptions, transports } from 'winston'

// For development environment
const loggerOptions: LoggerOptions = {
	level: 'silly',
	format: format.combine(format.errors({ stack: true })),
	transports: [
		// - Write all logs to console when in development environment
		new transports.Console({
			format: format.combine(
				format.timestamp(),
				format.ms(),
				format.errors({ stack: true }),
				nestWinstonModuleUtilities.format.nestLike('Nest Template', {
					colors: true,
					prettyPrint: true,
				}),
			),
			handleExceptions: true,
		}),
		// - Write all logs with importance level of `error` or less to `error.log` file
		new transports.DailyRotateFile({
			level: 'error',
			dirname: 'logs/error',
			filename: `%DATE%-error.log`, // This will make the log to rotate every day
			datePattern: 'YYYY-MM-DD',
			format: format.combine(
				format.timestamp(),
				format.ms(),
				format.errors({ stack: true }),
				nestWinstonModuleUtilities.format.nestLike('Nest Template', {
					prettyPrint: true,
				}),
			),
			handleExceptions: true,
			zippedArchive: true, // gzip archived log files
			maxFiles: 90, // Will keep error log until they are older than 90 days
		}),
		// - Write all logs `combined.log` file
		new transports.DailyRotateFile({
			dirname: 'logs/combined',
			filename: `%DATE%-combined.log`, // This will make the log to rotate every day
			datePattern: 'YYYY-MM-DD',
			format: format.combine(
				format.timestamp(),
				format.ms(),
				format.errors({ stack: true }),
				nestWinstonModuleUtilities.format.nestLike('Nest Template', {
					prettyPrint: true,
				}),
			),
			handleExceptions: true,
			zippedArchive: true, // gzip archived log files
			maxFiles: '10d', // Will keep combined log until they are older than 10 days
		}),
	],
}

const winstonLoggerInstance = createLogger(loggerOptions)
export default winstonLoggerInstance
