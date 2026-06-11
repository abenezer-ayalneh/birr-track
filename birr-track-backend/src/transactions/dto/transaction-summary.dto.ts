export type WaiterBreakdown = {
	userId: string
	displayName: string
	amount: number
	count: number
}

export type BankBreakdown = {
	bankName: string
	amount: number
	count: number
}

export type AttentionCounters = {
	needsReview: number
	duplicates: number
	editedByUploader: number
}

export class TransactionSummaryDto {
	totalRevenue!: number
	transactionCount!: number
	waiterBreakdown?: WaiterBreakdown[]
	bankBreakdown?: BankBreakdown[]
	attentionCounters?: AttentionCounters
}
