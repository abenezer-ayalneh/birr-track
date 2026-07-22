import type { ApiClient } from '../client'
import type {
	AccountMembership,
  Invite,
  Language,
  Page,
  PageParams,
  Registration,
  RegistrationEntryState,
  StaffMember,
  Summary,
  Transaction,
  TransactionDetail,
  TransactionFilters,
  TransactionUpdate,
} from '../types'
import {
  fixtureBusinessesList,
  fixtureInvitesList,
  fixtureMe,
  fixtureRegistrationsList,
  fixtureSummary,
  fixtureStaffList,
  fixtureTransactionDetail,
  fixtureTransactionList,
} from './fixtures'

let currentRole: 'waiter' | 'manager' | 'owner' | 'platform_owner' = 'waiter'
let currentLanguage: Language = (localStorage.getItem('birr-track-language') as Language | null) || 'en'
let entryOverride: RegistrationEntryState['status'] | null = null

export function setMockRole(role: 'waiter' | 'manager' | 'owner' | 'platform_owner'): void {
  currentRole = role
}

export function getMockRole(): 'waiter' | 'manager' | 'owner' | 'platform_owner' {
  return currentRole
}

export function setMockEntryState(status: RegistrationEntryState['status'] | null): void {
  entryOverride = status
}

/**
 * Mock API client with optimistic updates and fixtures.
 * Implements the full ApiClient interface per spec §4–5.
 */
export class MockApiClient implements ApiClient {
  private transactions: TransactionDetail[] = []

  constructor() {
    // Hydrate from fixtures; clients mutate this for optimistic updates.
    this.transactions = fixtureTransactionList('manager').map((t) =>
      fixtureTransactionDetail(t.id),
    )
  }

  async me() {
    return { ...fixtureMe(currentRole), language: currentLanguage }
  }

  async getEntryState(): Promise<RegistrationEntryState> {
    const me = { ...fixtureMe(currentRole), language: currentLanguage }
		if (entryOverride === 'platform_owner' || currentRole === 'platform_owner') return { status: 'platform_owner', ...me, business: me.business ?? undefined }

    const base = { telegramUserId: me.telegramUserId, displayName: me.displayName, language: currentLanguage }
    if (entryOverride === 'invited') {
      return {
        ...base,
        status: 'invited',
        invite: { id: 'mock-invite', businessId: 'biz-demo-1', businessName: 'Addis Coffee House', role: 'waiter', expiresAt: new Date(Date.now() + 86400000).toISOString() },
      }
    }
    if (entryOverride === 'pending') {
      return {
        ...base,
        status: 'pending',
        registration: { id: 'mock-registration', businessName: 'Addis Coffee House', requestedAt: new Date().toISOString() },
      }
    }
    if (entryOverride === 'rejected') {
      return {
        ...base,
        status: 'rejected',
        registration: { id: 'mock-registration', businessName: 'Addis Coffee House', requestedAt: new Date().toISOString() },
        rejectionReason: 'Please use the public Business name used by your team.',
      }
    }
    if (entryOverride === 'unregistered') return { ...base, status: 'unregistered' }
		return { status: 'active', ...me, business: me.business ?? undefined }
  }

  async submitRegistration(businessName: string, language: Language): Promise<RegistrationEntryState> {
    const me = { ...fixtureMe(currentRole), language }
    entryOverride = 'pending'
    localStorage.setItem('birr-track-language', language)
    currentLanguage = language
    return {
      status: 'pending',
      telegramUserId: me.telegramUserId,
      displayName: me.displayName,
      language,
      registration: { id: 'mock-registration', businessName: businessName.trim(), requestedAt: new Date().toISOString() },
    }
  }

  async updateLanguage(language: Language): Promise<Language> {
    currentLanguage = language
    localStorage.setItem('birr-track-language', language)
    return language
  }

  async getAccount(): Promise<AccountMembership> {
    const me = await this.me()
    if (!me.business || me.role === 'platform_owner') throw new Error('No business membership')
    return { userId: me.userId, displayName: me.displayName, role: me.role, business: me.business }
  }

  async leaveBusiness(): Promise<void> {
    // Keep the current mock role so the departure success state can be exercised.
  }

  async listTransactions(params?: TransactionFilters & PageParams): Promise<Page<Transaction>> {
    let items = fixtureTransactionList(currentRole)

    // Apply filters.
    if (params?.status) {
      items = items.filter((t) => t.status === params.status)
    }
    if (params?.waiterId) {
      items = items.filter((t) => t.waiter.id === params.waiterId)
    }
    if (params?.bank) {
      items = items.filter((t) => t.bankName === params.bank)
    }
    if (params?.duplicate) {
      items = items.filter((t) => t.isDuplicate)
    }
    if (params?.edited) {
      items = items.filter((t) => t.editedByUploader)
    }
    if (params?.from) {
      items = items.filter((t) => t.createdAt >= params.from!)
    }
    if (params?.to) {
      items = items.filter((t) => t.createdAt <= params.to!)
    }

    const page = params?.page ?? 1
    const pageSize = params?.pageSize ?? 20
    const start = (page - 1) * pageSize
    const paged = items.slice(start, start + pageSize)

    return {
      items: paged,
      total: items.length,
      page,
      pageSize,
      hasMore: start + pageSize < items.length,
    }
  }

  async getTransaction(id: string): Promise<TransactionDetail> {
    const cached = this.transactions.find((t) => t.id === id)
    if (cached) return cached

    const tx = fixtureTransactionDetail(id)
    this.transactions.push(tx)
    return tx
  }

  async updateTransaction(id: string, patch: TransactionUpdate): Promise<TransactionDetail> {
    let tx = this.transactions.find((t) => t.id === id)
    if (!tx) {
      tx = fixtureTransactionDetail(id)
      this.transactions.push(tx)
    }

    // Optimistic update: mock backend would write to EditLog.
    Object.assign(tx, {
      bankName: patch.bankName ?? tx.bankName,
      amount: patch.amount !== undefined ? patch.amount : tx.amount,
      transactionId: patch.transactionId ?? tx.transactionId,
      timestamp: patch.timestamp ?? tx.timestamp,
      editedByUploader: true,
      // Transition to recorded if all fields now present.
      status:
        (patch.bankName ?? tx.bankName) &&
        (patch.amount !== undefined ? patch.amount : tx.amount) &&
        (patch.transactionId ?? tx.transactionId) &&
        (patch.timestamp ?? tx.timestamp)
          ? 'recorded'
          : tx.status,
    })

    return tx
  }

  async deleteTransaction(id: string): Promise<void> {
    const tx = this.transactions.find((t) => t.id === id)
    if (tx && tx.status !== 'needs_review') {
      throw new Error('Only Needs Review transactions can be deleted')
    }
    this.transactions = this.transactions.filter((t) => t.id !== id)
  }

  async getSummary(): Promise<Summary> {
    return fixtureSummary()
  }

  async exportTransactions(): Promise<Blob> {
    // Mock: a tiny placeholder file so the download flow can be exercised in dev.
    return new Blob(['mock export'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
  }

  async createTransactionExportDownload(): Promise<null> {
    return null
  }

  async getTransactionImage(id: string): Promise<Blob> {
    // Mock: turn the data-URI receipt SVG into a Blob so the blob/object-URL
    // path in the views can run identically against mock and real backends.
    const detail = await this.getTransaction(id)
    const res = await fetch(detail.imageUrl)
    return res.blob()
  }

  async listStaff(): Promise<StaffMember[]> {
    return fixtureStaffList()
  }

  async promoteToManager(userId: string): Promise<StaffMember> {
    const staff = fixtureStaffList().find((s) => s.userId === userId)
    if (!staff) throw new Error(`Staff ${userId} not found`)
    return { ...staff, role: 'manager' }
  }

  async demoteToWaiter(userId: string): Promise<StaffMember> {
    const staff = fixtureStaffList().find((s) => s.userId === userId)
    if (!staff) throw new Error(`Staff ${userId} not found`)
    return { ...staff, role: 'waiter' }
  }

  async removeStaff(): Promise<void> {
    // No-op in mock.
  }

  async listInvites(): Promise<Invite[]> {
    return fixtureInvitesList()
  }

  async revokeInvite(inviteId: string): Promise<Invite> {
    const inv = fixtureInvitesList().find((i) => i.id === inviteId)
    if (!inv) throw new Error(`Invite ${inviteId} not found`)
    return { ...inv, status: 'revoked' }
  }

  async listRegistrations(): Promise<Registration[]> {
    return fixtureRegistrationsList()
  }

  async approveRegistration(id: string): Promise<Registration> {
    const reg = fixtureRegistrationsList().find((r) => r.id === id)
    if (!reg) throw new Error(`Registration ${id} not found`)
    return { ...reg, status: 'approved' }
  }

  async rejectRegistration(id: string, reason?: string): Promise<Registration> {
    const reg = fixtureRegistrationsList().find((r) => r.id === id)
    if (!reg) throw new Error(`Registration ${id} not found`)
    return { ...reg, status: 'rejected', rejectionReason: reason }
  }

  async listBusinesses() {
    return fixtureBusinessesList()
  }

  async suspendBusiness(id: string) {
    const biz = fixtureBusinessesList().find((b) => b.id === id)
    if (!biz) throw new Error(`Business ${id} not found`)
    return { ...biz, status: 'suspended' as const }
  }

  async unsuspendBusiness(id: string) {
    const biz = fixtureBusinessesList().find((b) => b.id === id)
    if (!biz) throw new Error(`Business ${id} not found`)
    return { ...biz, status: 'active' as const }
  }
}

export const mockApiClient = new MockApiClient()
