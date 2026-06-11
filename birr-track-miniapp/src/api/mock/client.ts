import type { ApiClient } from '../client'
import type {
  Invite,
  Page,
  PageParams,
  Registration,
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

export function setMockRole(role: 'waiter' | 'manager' | 'owner' | 'platform_owner'): void {
  currentRole = role
}

export function getMockRole(): 'waiter' | 'manager' | 'owner' | 'platform_owner' {
  return currentRole
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
    return fixtureMe(currentRole)
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

  async getSummary(): Promise<Summary> {
    return fixtureSummary()
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
}

export const mockApiClient = new MockApiClient()
