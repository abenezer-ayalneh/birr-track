/**
 * Domain types matching docs/specs/roles-and-admin-panel.md.
 * Terms per CONTEXT.md: Transaction, Needs Review, Recorded, Duplicate, Invite, Business.
 */

export type Role = 'waiter' | 'manager' | 'owner' | 'platform_owner'

export const ROLES: readonly Role[] = ['waiter', 'manager', 'owner', 'platform_owner']

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

export type BusinessStatus = 'pending' | 'active' | 'rejected' | 'suspended'

export interface Business {
  id: string
  name: string
  status: BusinessStatus
  createdAt: string
}

/** Result of auth/me: who am I, what can I do, which Business am I in. */
export interface Me {
  userId: string
  telegramUserId: number
  displayName: string
  role: Role
  /** null for the Platform Owner, who belongs to no Business. */
  business: Business | null
}

export type TransactionStatus = 'recorded' | 'needs_review'

export interface WaiterRef {
  id: string
  displayName: string
}

export interface Transaction {
  id: string
  waiter: WaiterRef
  /** Extracted fields are null when extraction failed for them (needs_review). */
  bankName: string | null
  amount: number | null
  currency: 'ETB'
  transactionId: string | null
  /** ISO timestamp printed on the Receipt. */
  timestamp: string | null
  /** VLM extraction confidence, 0..1. */
  confidence: number
  status: TransactionStatus
  isDuplicate: boolean
  editedByUploader: boolean
  /** When the Receipt was submitted to the bot. */
  createdAt: string
}

export interface TransactionDetail extends Transaction {
  /** URL of the Receipt image (signed URL in production, data URI in mocks). */
  imageUrl: string
}

/** Editable fields per spec 3.4: amount, bank, transaction ID, timestamp. */
export interface TransactionUpdate {
  bankName?: string | null
  amount?: number | null
  transactionId?: string | null
  timestamp?: string | null
}

export interface TransactionFilters {
  status?: TransactionStatus
  waiterId?: string
  bank?: string
  /** ISO date, inclusive. */
  from?: string
  /** ISO date, inclusive. */
  to?: string
}

export interface PageParams {
  /** 1-based. */
  page?: number
  pageSize?: number
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface SummaryBreakdownRow {
  key: string
  label: string
  count: number
  amount: number
}

export interface Summary {
  range: { from: string; to: string }
  totals: { count: number; amount: number }
  perWaiter: SummaryBreakdownRow[]
  perBank: SummaryBreakdownRow[]
  attention: { needsReview: number; duplicates: number; edited: number }
}

export type StaffRole = 'waiter' | 'manager' | 'owner'

export interface StaffMember {
  userId: string
  displayName: string
  telegramUsername?: string
  role: StaffRole
  joinedAt: string
}

export type InviteStatus = 'pending' | 'redeemed' | 'revoked' | 'expired'

export interface Invite {
  id: string
  inviteeName: string
  inviteeTelegramId: number
  role: Exclude<StaffRole, 'owner'>
  status: InviteStatus
  createdBy: string
  createdAt: string
  expiresAt: string
}

export type RegistrationStatus = 'pending' | 'approved' | 'rejected'

export interface Registration {
  id: string
  businessName: string
  registrant: {
    displayName: string
    username?: string
    telegramUserId: number
  }
  status: RegistrationStatus
  requestedAt: string
  rejectionReason?: string
}

export interface BusinessListing extends Business {
  ownerName: string
  staffCount: number
}
