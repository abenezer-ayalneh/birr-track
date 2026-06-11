/**
 * Realistic Ethiopian receipt data: banks, amounts, transactions, staff.
 * Chunk C uses these directly; chunk G will fetch from the backend.
 */

import { receiptDataUri } from './receiptSvg'
import type {
  BusinessListing,
  Invite,
  Me,
  Registration,
  StaffMember,
  Summary,
  Transaction,
  TransactionDetail,
} from '../types'

const PAYER_NAMES = ['Abebe Wolde', 'Almaz Tekle', 'Yohannes Kebede', 'Hiwot Gezahegne', 'Muluken Assefa']

function randomItem<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

export function fixtureMe(role: 'waiter' | 'manager' | 'owner' | 'platform_owner'): Me {
  if (role === 'platform_owner') {
    return {
      userId: 'user-po-1',
      telegramUserId: 999999999,
      displayName: 'Addis Admin',
      role: 'platform_owner',
      business: null,
    }
  }

  return {
    userId: 'user-' + role + '-1',
    telegramUserId: 111111111 + Math.floor(Math.random() * 100000),
    displayName:
      role === 'waiter'
        ? 'Kalkidan Tesfaye'
        : role === 'manager'
          ? 'Yusuf Mohamed'
          : 'Amina Kebede',
    role,
    business: {
      id: 'biz-demo-1',
      name: 'Addis Coffee House',
      status: 'active',
      createdAt: '2026-01-15T10:00:00Z',
    },
  }
}

export function fixtureTransactionList(
  role: 'waiter' | 'manager' | 'owner' | 'platform_owner',
): Transaction[] {
  const transactions: Transaction[] = []

  // Waiter sees only their own transactions; manager/owner see all.
  const baseTransactions = [
    {
      waiter: 'user-waiter-1',
      name: 'Kalkidan Tesfaye',
      bank: 'Commercial Bank of Ethiopia',
      amount: 2500.0,
      txid: 'TXN202606001',
      timestamp: '2026-06-11T14:30:00Z',
      status: 'recorded' as const,
      isDuplicate: false,
      edited: false,
      confidence: 0.95,
    },
    {
      waiter: 'user-waiter-1',
      name: 'Kalkidan Tesfaye',
      bank: 'Telebirr',
      amount: 500.0,
      txid: '',
      timestamp: '2026-06-11T10:15:00Z',
      status: 'needs_review' as const,
      isDuplicate: false,
      edited: false,
      confidence: 0.62,
    },
    {
      waiter: 'user-waiter-2',
      name: 'Yohannes Kebede',
      bank: 'Awash Bank',
      amount: 1200.0,
      txid: 'TXN202606002',
      timestamp: '2026-06-10T16:45:00Z',
      status: 'recorded' as const,
      isDuplicate: false,
      edited: true,
      confidence: 0.88,
    },
    {
      waiter: 'user-waiter-2',
      name: 'Yohannes Kebede',
      bank: 'Dashen Bank',
      amount: 350.0,
      txid: 'TXN202606003',
      timestamp: '2026-06-10T11:20:00Z',
      status: 'recorded' as const,
      isDuplicate: true,
      edited: false,
      confidence: 0.91,
    },
    {
      waiter: 'user-waiter-3',
      name: 'Hiwot Gezahegne',
      bank: 'Bank of Abyssinia',
      amount: 890.0,
      txid: 'TXN202606004',
      timestamp: '2026-06-09T13:00:00Z',
      status: 'recorded' as const,
      isDuplicate: false,
      edited: false,
      confidence: 0.93,
    },
    {
      waiter: 'user-waiter-1',
      name: 'Kalkidan Tesfaye',
      bank: 'Commercial Bank of Ethiopia',
      amount: 1500.0,
      txid: 'TXN202606005',
      timestamp: '2026-06-08T09:30:00Z',
      status: 'needs_review' as const,
      isDuplicate: false,
      edited: false,
      confidence: 0.55,
    },
  ]

  for (const tx of baseTransactions) {
    if (role === 'waiter' && tx.waiter !== 'user-waiter-1') continue

    transactions.push({
      id: `txn-${baseTransactions.indexOf(tx)}`,
      waiter: {
        id: tx.waiter,
        displayName: tx.name,
      },
      bankName: tx.bank,
      amount: tx.amount,
      currency: 'ETB',
      transactionId: tx.txid || null,
      timestamp: tx.timestamp,
      confidence: tx.confidence,
      status: tx.status,
      isDuplicate: tx.isDuplicate,
      editedByUploader: tx.edited,
      createdAt: tx.timestamp,
    })
  }

  // Needs_review first for waiters.
  if (role === 'waiter') {
    return transactions.sort((a, b) => {
      const aIsNeedsReview = a.status === 'needs_review' ? 1 : 0
      const bIsNeedsReview = b.status === 'needs_review' ? 1 : 0
      return bIsNeedsReview - aIsNeedsReview
    })
  }

  return transactions
}

export function fixtureTransactionDetail(id: string): TransactionDetail {
  const txns = fixtureTransactionList('manager')
  const txn = txns.find((t) => t.id === id)

  if (!txn) throw new Error(`Transaction ${id} not found`)

  return {
    ...txn,
    imageUrl: receiptDataUri({
      bankName: txn.bankName || 'Unknown Bank',
      amount: txn.amount || 0,
      transactionId: txn.transactionId || 'UNKNOWN',
      timestamp: txn.timestamp || new Date().toISOString(),
      payer: randomItem(PAYER_NAMES),
    }),
  }
}

export function fixtureSummary(): Summary {
  const from = daysAgo(30)
  const to = new Date().toISOString().split('T')[0]

  return {
    range: { from, to },
    totals: { count: 42, amount: 18750 },
    perWaiter: [
      { key: 'w1', label: 'Kalkidan Tesfaye', count: 15, amount: 6200 },
      { key: 'w2', label: 'Yohannes Kebede', count: 12, amount: 5100 },
      { key: 'w3', label: 'Hiwot Gezahegne', count: 10, amount: 4350 },
      { key: 'w4', label: 'Muluken Assefa', count: 5, amount: 3100 },
    ],
    perBank: [
      { key: 'cbe', label: 'Commercial Bank of Ethiopia', count: 14, amount: 7200 },
      { key: 'tb', label: 'Telebirr', count: 12, amount: 5100 },
      { key: 'awash', label: 'Awash Bank', count: 10, amount: 4350 },
      { key: 'dashen', label: 'Dashen Bank', count: 6, amount: 2100 },
    ],
    attention: { needsReview: 2, duplicates: 1, edited: 1 },
  }
}

export function fixtureStaffList(): StaffMember[] {
  return [
    {
      userId: 'user-waiter-1',
      displayName: 'Kalkidan Tesfaye',
      telegramUsername: 'kalkidan_t',
      role: 'waiter',
      joinedAt: '2026-03-15T10:00:00Z',
    },
    {
      userId: 'user-waiter-2',
      displayName: 'Yohannes Kebede',
      telegramUsername: 'yohannes_k',
      role: 'waiter',
      joinedAt: '2026-04-01T10:00:00Z',
    },
    {
      userId: 'user-waiter-3',
      displayName: 'Hiwot Gezahegne',
      telegramUsername: 'hiwot_g',
      role: 'waiter',
      joinedAt: '2026-05-10T10:00:00Z',
    },
    {
      userId: 'user-manager-1',
      displayName: 'Yusuf Mohamed',
      telegramUsername: 'yusuf_m',
      role: 'manager',
      joinedAt: '2026-02-01T10:00:00Z',
    },
    {
      userId: 'user-owner-1',
      displayName: 'Amina Kebede',
      telegramUsername: 'amina_k',
      role: 'owner',
      joinedAt: '2026-01-15T10:00:00Z',
    },
  ]
}

export function fixtureInvitesList(): Invite[] {
  return [
    {
      id: 'inv-1',
      inviteeName: 'Abebe Wolde',
      inviteeTelegramId: 222222222,
      role: 'waiter',
      status: 'pending',
      createdBy: 'user-owner-1',
      createdAt: '2026-06-10T14:00:00Z',
      expiresAt: '2026-06-17T14:00:00Z',
    },
    {
      id: 'inv-2',
      inviteeName: 'Almaz Tekle',
      inviteeTelegramId: 333333333,
      role: 'waiter',
      status: 'pending',
      createdBy: 'user-manager-1',
      createdAt: '2026-06-09T10:30:00Z',
      expiresAt: '2026-06-16T10:30:00Z',
    },
  ]
}

export function fixtureRegistrationsList(): Registration[] {
  return [
    {
      id: 'reg-1',
      businessName: 'Meskerem Restaurant',
      registrant: {
        displayName: 'Bekele Tekle',
        username: 'bekele_t',
        telegramUserId: 444444444,
      },
      status: 'pending',
      requestedAt: '2026-06-11T08:15:00Z',
    },
    {
      id: 'reg-2',
      businessName: 'Blue Nile Café',
      registrant: {
        displayName: 'Tigist Haile',
        username: 'tigist_h',
        telegramUserId: 555555555,
      },
      status: 'pending',
      requestedAt: '2026-06-10T16:45:00Z',
    },
    {
      id: 'reg-3',
      businessName: 'Ethiopian Flavors',
      registrant: {
        displayName: 'Tadesse Molla',
        username: 'tadesse_m',
        telegramUserId: 666666666,
      },
      status: 'pending',
      requestedAt: '2026-06-09T12:00:00Z',
    },
  ]
}

export function fixtureBusinessesList(): BusinessListing[] {
  return [
    {
      id: 'biz-1',
      name: 'Addis Coffee House',
      status: 'active',
      createdAt: '2026-01-15T10:00:00Z',
      ownerName: 'Amina Kebede',
      staffCount: 5,
    },
    {
      id: 'biz-2',
      name: 'Meskerem Restaurant',
      status: 'active',
      createdAt: '2026-02-20T10:00:00Z',
      ownerName: 'Bekele Tekle',
      staffCount: 8,
    },
    {
      id: 'biz-3',
      name: 'Blue Nile Café',
      status: 'suspended',
      createdAt: '2026-03-10T10:00:00Z',
      ownerName: 'Tigist Haile',
      staffCount: 3,
    },
  ]
}
