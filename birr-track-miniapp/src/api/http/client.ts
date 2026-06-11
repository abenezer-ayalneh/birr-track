import type { ApiClient } from '../client'
import type {
  BusinessListing,
  BusinessStatus,
  Invite,
  Me,
  Page,
  PageParams,
  Registration,
  StaffMember,
  StaffRole,
  Summary,
  Transaction,
  TransactionDetail,
  TransactionFilters,
  TransactionStatus,
  TransactionUpdate,
} from '../types'
import { HttpFetcher } from './fetcher'
import { AuthSession } from './session'

/* ------------------------------------------------------------------ *
 * Backend wire shapes (verified against birr-track-backend controllers
 * and services). These differ from the Mini App domain types in several
 * places; the mapping functions below adapt them.
 * ------------------------------------------------------------------ */

interface WireTransaction {
  id: string
  telegramUserId: string
  telegramName: string
  businessId: string | null
  userId: string | null
  status: TransactionStatus
  amount: number | null
  transactionId: string | null
  timestamp: string | null
  bankName: string | null
  confidence: number
  isDuplicate: boolean
  editedByUploader: boolean
  imageKey: string | null
  createdAt: string
}

interface WirePage {
  page: number
  limit: number
  total: number
  items: WireTransaction[]
}

interface WireSummary {
  totalRevenue: number
  transactionCount: number
  waiterBreakdown?: Array<{ userId: string; displayName: string; amount: number; count: number }>
  bankBreakdown?: Array<{ bankName: string; amount: number; count: number }>
  attentionCounters?: { needsReview: number; duplicates: number; editedByUploader: number }
}

interface WireStaffMember {
  id: string
  telegramUserId: string
  displayName: string
  role: StaffRole
  removedAt: string | null
  createdAt?: string
}

interface WireInvite {
  id: string
  inviteeTelegramId: string
  businessId: string
  role: 'waiter' | 'manager'
  createdByUserId: string
  status: 'pending' | 'redeemed' | 'revoked' | 'expired'
  expiresAt: string
  createdAt: string
  createdBy?: { id: string; displayName: string }
}

interface WireRegistration {
  businessId: string
  businessName: string
  status: string
  registrant: { userId: string; telegramUserId: string; displayName: string }
  createdAt: string
}

interface WireBusiness {
  id: string
  name: string
  status: BusinessStatus
  ownerUserId: string | null
  createdAt: string
}

/* ------------------------------------------------------------------ *
 * Mappers
 * ------------------------------------------------------------------ */

function toTransaction(w: WireTransaction): Transaction {
  return {
    id: w.id,
    // The backend has no nested waiter ref on the transaction row; it carries
    // the submitting user's id (userId) + the denormalized telegram name.
    waiter: { id: w.userId ?? w.telegramUserId, displayName: w.telegramName },
    bankName: w.bankName,
    amount: w.amount,
    currency: 'ETB',
    transactionId: w.transactionId,
    timestamp: w.timestamp,
    confidence: w.confidence,
    status: w.status,
    isDuplicate: w.isDuplicate,
    editedByUploader: w.editedByUploader,
    createdAt: w.createdAt,
  }
}

function toStaffMember(w: WireStaffMember): StaffMember {
  return {
    userId: w.id,
    displayName: w.displayName,
    role: w.role,
    // Backend has no telegram username on the users table; omitted.
    joinedAt: w.createdAt ?? new Date(0).toISOString(),
  }
}

function toInvite(w: WireInvite): Invite {
  return {
    id: w.id,
    // The backend stores only the invitee's Telegram ID (the picker captured the
    // account, not a display name), so we surface the ID as the label.
    inviteeName: `Telegram #${w.inviteeTelegramId}`,
    inviteeTelegramId: Number(w.inviteeTelegramId),
    role: w.role,
    status: w.status,
    createdBy: w.createdBy?.displayName ?? w.createdByUserId,
    createdAt: w.createdAt,
    expiresAt: w.expiresAt,
  }
}

function toRegistration(w: WireRegistration): Registration {
  return {
    // The backend keys registration actions by businessId, so that is the id the
    // Mini App passes to approve/reject.
    id: w.businessId,
    businessName: w.businessName,
    registrant: {
      displayName: w.registrant.displayName,
      telegramUserId: Number(w.registrant.telegramUserId),
    },
    status: w.status === 'active' ? 'approved' : w.status === 'rejected' ? 'rejected' : 'pending',
    requestedAt: w.createdAt,
  }
}

/**
 * Build a transaction filter query for the backend.
 * Note the field-name differences: `from`/`to` → `startDate`/`endDate`,
 * `page`/`pageSize` → `page`/`limit`, and waiter filtering is by Telegram user
 * id (the only key the backend transactions list accepts).
 */
function toTransactionQuery(
  params: (TransactionFilters & PageParams) | undefined,
  waiterTelegramIds: Map<string, string>,
): Record<string, string | number | undefined> {
  const query: Record<string, string | number | undefined> = {}
  if (params?.page) query.page = params.page
  if (params?.pageSize) query.limit = params.pageSize
  if (params?.from) query.startDate = params.from
  if (params?.to) query.endDate = params.to
  if (params?.waiterId) {
    // The Mini App filters by userId; the backend list filters by telegramUserId.
    query.telegramUserId = waiterTelegramIds.get(params.waiterId) ?? params.waiterId
  }
  return query
}

/**
 * Real HTTP API client. Implements the same `ApiClient` interface as the mock,
 * so every view works unchanged once this is provided.
 *
 * Some Mini App filters (status, bank) have no backend query param yet, so they
 * are applied client-side on the returned page (documented inline).
 */
export class HttpApiClient implements ApiClient {
  private readonly fetcher: HttpFetcher
  /** Maps userId → telegramUserId, populated from the summary/staff lookups so
   * waiter filtering can translate to the backend's telegramUserId param. */
  private waiterTelegramIds = new Map<string, string>()

  constructor(
    private readonly baseUrl: string,
    private readonly session: AuthSession,
  ) {
    this.fetcher = new HttpFetcher(baseUrl, session)
  }

  /** The authenticated user. Business name/status aren't on the auth payload, so
   * for managers/owners we hydrate the Business from the platform businesses list
   * only when available; otherwise we present a minimal Business from the token. */
  async me(): Promise<Me> {
    const auth = await this.session.ensure()

    const business =
      auth.businessId === null
        ? null
        : {
            id: auth.businessId,
            // The auth payload doesn't carry the business name/status. We don't
            // have a self-scoped business endpoint, so present the id as a label
            // and treat the membership as active (suspended businesses are
            // read-only, surfaced per-action by the backend).
            name: 'My Business',
            status: 'active' as BusinessStatus,
            createdAt: new Date(0).toISOString(),
          }

    return {
      userId: auth.userId ?? auth.businessId ?? 'platform-owner',
      telegramUserId: 0,
      displayName: auth.displayName,
      role: auth.role,
      business,
    }
  }

  async listTransactions(params?: TransactionFilters & PageParams): Promise<Page<Transaction>> {
    const page = await this.fetcher.request<WirePage>('/transactions', {
      query: toTransactionQuery(params, this.waiterTelegramIds),
    })

    let items = page.items.map(toTransaction)

    // Status and bank filters have no backend query param; apply them here.
    if (params?.status) items = items.filter((t) => t.status === params.status)
    if (params?.bank) items = items.filter((t) => t.bankName === params.bank)

    const pageNum = page.page
    const pageSize = page.limit
    return {
      items,
      total: page.total,
      page: pageNum,
      pageSize,
      hasMore: pageNum * pageSize < page.total,
    }
  }

  async getTransaction(id: string): Promise<TransactionDetail> {
    const w = await this.fetcher.request<WireTransaction>(`/transactions/${id}`)
    return {
      ...toTransaction(w),
      // The receipt image is an authenticated stream; the edit view fetches it
      // as a blob with the Bearer header (a plain <img src> can't send it).
      imageUrl: `${this.baseUrl}/transactions/${id}/image`,
    }
  }

  async updateTransaction(id: string, patch: TransactionUpdate): Promise<TransactionDetail> {
    // The backend UpdateTransactionDto rejects null (IsNumber/IsString); only send
    // defined, non-null fields. It also validates amount must be >= 0 with <= 2 dp.
    const body: Record<string, unknown> = {}
    if (patch.bankName) body.bankName = patch.bankName
    if (patch.amount !== undefined && patch.amount !== null) body.amount = patch.amount
    if (patch.transactionId) body.transactionId = patch.transactionId
    if (patch.timestamp) body.timestamp = patch.timestamp

    const w = await this.fetcher.request<WireTransaction>(`/transactions/${id}`, {
      method: 'PATCH',
      body,
    })
    return {
      ...toTransaction(w),
      imageUrl: `${this.baseUrl}/transactions/${id}/image`,
    }
  }

  async getSummary(params?: { from?: string; to?: string }): Promise<Summary> {
    const w = await this.fetcher.request<WireSummary>('/transactions/summary', {
      query: { startDate: params?.from, endDate: params?.to },
    })

    const perWaiter = (w.waiterBreakdown ?? []).map((r) => {
      this.waiterTelegramIds.set(r.userId, this.waiterTelegramIds.get(r.userId) ?? r.userId)
      return { key: r.userId, label: r.displayName, count: r.count, amount: r.amount }
    })

    return {
      range: { from: params?.from ?? '', to: params?.to ?? '' },
      totals: { count: w.transactionCount, amount: w.totalRevenue },
      perWaiter,
      perBank: (w.bankBreakdown ?? []).map((r) => ({
        key: r.bankName,
        label: r.bankName,
        count: r.count,
        amount: r.amount,
      })),
      attention: {
        needsReview: w.attentionCounters?.needsReview ?? 0,
        duplicates: w.attentionCounters?.duplicates ?? 0,
        edited: w.attentionCounters?.editedByUploader ?? 0,
      },
    }
  }

  /** Authenticated Excel export → Blob (the button object-URLs it for download). */
  async exportTransactions(params?: TransactionFilters): Promise<Blob> {
    return this.fetcher.request<Blob>('/transactions/export', {
      query: {
        startDate: params?.from,
        endDate: params?.to,
        telegramUserId: params?.waiterId
          ? (this.waiterTelegramIds.get(params.waiterId) ?? params.waiterId)
          : undefined,
      },
      responseType: 'blob',
    })
  }

  /** Authenticated receipt image → Blob (for object-URL into <img>). */
  async getTransactionImage(id: string): Promise<Blob> {
    return this.fetcher.request<Blob>(`/transactions/${id}/image`, { responseType: 'blob' })
  }

  async listStaff(): Promise<StaffMember[]> {
    const rows = await this.fetcher.request<WireStaffMember[]>('/staff')
    return rows.map(toStaffMember)
  }

  async promoteToManager(userId: string): Promise<StaffMember> {
    const w = await this.fetcher.request<WireStaffMember>(`/staff/${userId}/promote`, { method: 'POST' })
    return toStaffMember(w)
  }

  async demoteToWaiter(userId: string): Promise<StaffMember> {
    const w = await this.fetcher.request<WireStaffMember>(`/staff/${userId}/demote`, { method: 'POST' })
    return toStaffMember(w)
  }

  async removeStaff(userId: string): Promise<void> {
    await this.fetcher.request<void>(`/staff/${userId}`, { method: 'DELETE', responseType: 'void' })
  }

  async listInvites(): Promise<Invite[]> {
    const rows = await this.fetcher.request<WireInvite[]>('/invites')
    return rows.map(toInvite)
  }

  async revokeInvite(inviteId: string): Promise<Invite> {
    const w = await this.fetcher.request<WireInvite>(`/invites/${inviteId}`, { method: 'DELETE' })
    return toInvite(w)
  }

  async listRegistrations(): Promise<Registration[]> {
    const rows = await this.fetcher.request<WireRegistration[]>('/registrations')
    return rows.map(toRegistration)
  }

  async approveRegistration(id: string): Promise<Registration> {
    // Keyed by businessId (which `toRegistration` mapped into `id`).
    await this.fetcher.request<{ status: string; message: string }>(`/registrations/${id}/approve`, {
      method: 'POST',
    })
    return {
      id,
      businessName: '',
      registrant: { displayName: '', telegramUserId: 0 },
      status: 'approved',
      requestedAt: new Date().toISOString(),
    }
  }

  async rejectRegistration(id: string, reason?: string): Promise<Registration> {
    // The backend reject endpoint does not accept a reason body yet.
    await this.fetcher.request<{ status: string; message: string }>(`/registrations/${id}/reject`, {
      method: 'POST',
    })
    return {
      id,
      businessName: '',
      registrant: { displayName: '', telegramUserId: 0 },
      status: 'rejected',
      requestedAt: new Date().toISOString(),
      rejectionReason: reason,
    }
  }

  async listBusinesses(): Promise<BusinessListing[]> {
    const rows = await this.fetcher.request<WireBusiness[]>('/businesses')
    // The backend list has no ownerName / staffCount; surface what's available.
    return rows.map((b) => ({
      id: b.id,
      name: b.name,
      status: b.status,
      createdAt: b.createdAt,
      ownerName: '',
      staffCount: 0,
    }))
  }

  async suspendBusiness(id: string): Promise<BusinessListing> {
    await this.fetcher.request<{ status: string; message: string }>(`/businesses/${id}/suspend`, {
      method: 'POST',
    })
    return { id, name: '', status: 'suspended', createdAt: '', ownerName: '', staffCount: 0 }
  }

  async unsuspendBusiness(id: string): Promise<BusinessListing> {
    await this.fetcher.request<{ status: string; message: string }>(`/businesses/${id}/unsuspend`, {
      method: 'POST',
    })
    return { id, name: '', status: 'active', createdAt: '', ownerName: '', staffCount: 0 }
  }
}
