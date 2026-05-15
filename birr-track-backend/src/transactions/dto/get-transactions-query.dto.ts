import { Type } from 'class-transformer'
import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator'

import { DEFAULT_PAGE, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../constants/transaction.constants'

export class GetTransactionsQueryDto {
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	page: number = DEFAULT_PAGE

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	limit: number = DEFAULT_PAGE_LIMIT

	@IsOptional()
	@IsDateString()
	startDate?: string

	@IsOptional()
	@IsDateString()
	endDate?: string

	@IsOptional()
	@IsString()
	telegramUserId?: string

	getEffectiveLimit(): number {
		return Math.min(this.limit, MAX_PAGE_LIMIT)
	}
}
