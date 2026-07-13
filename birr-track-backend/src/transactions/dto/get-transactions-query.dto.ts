import { Type } from 'class-transformer'
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator'

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

	/** Optional filters shared by the list, summary, and Excel export endpoints. */
	@IsOptional()
	@IsIn(['recorded', 'needs_review'])
	status?: 'recorded' | 'needs_review'

	@IsOptional()
	@IsString()
	bank?: string

	@IsOptional()
	@IsIn(['1', 'true'])
	duplicate?: string

	@IsOptional()
	@IsIn(['1', 'true'])
	edited?: string

	getEffectiveLimit(): number {
		return Math.min(this.limit, MAX_PAGE_LIMIT)
	}
}
