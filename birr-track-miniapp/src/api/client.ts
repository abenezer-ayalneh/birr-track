import type {
	AccountMembership,
  BusinessListing,
  Invite,
  Me,
  Page,
  PageParams,
  Registration,
  StaffMember,
  Summary,
  Transaction,
  TransactionDetail,
  TransactionFilters,
  TransactionUpdate,
  Language,
} from './types'

/**
 * The contract between the Mini App and the backend (spec §4–5).
 * Chunk C ships only the mock implementation; chunk G swaps in a real
 * HTTP client (JWT from POST /auth/telegram) behind this same interface.
 */
export interface ApiClient {
  /** Who am I — role and Business come from the backend, never the client. */
  me(): Promise<Me>
  updateLanguage(language: Language): Promise<Language>

  // Account membership
  getAccount(): Promise<AccountMembership>
  leaveBusiness(): Promise<void>

  // Transactions
  listTransactions(params?: TransactionFilters & PageParams): Promise<Page<Transaction>>
  getTransaction(id: string): Promise<TransactionDetail>
  updateTransaction(id: string, patch: TransactionUpdate): Promise<TransactionDetail>
  deleteTransaction(id: string): Promise<void>

  // Reports (Manager/Owner)
  getSummary(params?: { from?: string; to?: string }): Promise<Summary>
  /** Excel export of the (optionally filtered) business transactions. */
  exportTransactions(params?: TransactionFilters): Promise<Blob>
  /** Authenticated receipt image fetched as a Blob (Bearer header can't ride <img src>). */
  getTransactionImage(id: string): Promise<Blob>

  // Staff management (Manager/Owner)
  listStaff(): Promise<StaffMember[]>
  promoteToManager(userId: string): Promise<StaffMember>
  demoteToWaiter(userId: string): Promise<StaffMember>
  removeStaff(userId: string, reason?: string): Promise<void>
  listInvites(): Promise<Invite[]>
  revokeInvite(inviteId: string): Promise<Invite>

  // Platform Owner
  listRegistrations(): Promise<Registration[]>
  approveRegistration(id: string): Promise<Registration>
  rejectRegistration(id: string, reason?: string): Promise<Registration>
  listBusinesses(): Promise<BusinessListing[]>
  suspendBusiness(id: string): Promise<BusinessListing>
  unsuspendBusiness(id: string): Promise<BusinessListing>
}
