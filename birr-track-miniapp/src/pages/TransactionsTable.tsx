import { useQuery } from '@tanstack/react-query'
import { useLocation, useSearch } from 'wouter'
import { useMemo, useState } from 'react'
import type { Transaction, TransactionStatus } from '../api/types'
import { PageHeader } from '../components/PageHeader'
import { useApi } from '../lib/useApi'
import { formatEtb, formatShortDate } from '../lib/format'
import { usePageRefresh } from '../lib/useRefresh'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import '../styles/waiter.css'
import '../styles/admin.css'

const PAGE_SIZE = 20

/** Filters that the attention counters / table controls drive, read from the URL. */
interface TableFilters {
  status?: TransactionStatus
  duplicate?: boolean
  edited?: boolean
  waiterId?: string
  bank?: string
  from?: string
  to?: string
}

function parseFilters(search: string): TableFilters {
  const p = new URLSearchParams(search)
  const status = p.get('status')
  return {
    status: status === 'recorded' || status === 'needs_review' ? status : undefined,
    duplicate: p.get('duplicate') === '1',
    edited: p.get('edited') === '1',
    waiterId: p.get('waiterId') || undefined,
    bank: p.get('bank') || undefined,
    from: p.get('from') || undefined,
    to: p.get('to') || undefined,
  }
}

/**
 * Business-wide transactions table for Managers/Owners: filter by waiter, bank,
 * status, date; paginated; rows open the detail/edit screen.
 * Duplicate / edited attention filters are applied client-side (the backend list
 * has no query param for them — see report).
 */
export function TransactionsTable() {
  const api = useApi()
  const [, navigate] = useLocation()
  const search = useSearch()
  const initial = useMemo(() => parseFilters(search), [search])

  const [status, setStatus] = useState<TransactionStatus | ''>(initial.status ?? '')
  const [waiterId, setWaiterId] = useState(initial.waiterId ?? '')
  const [bank, setBank] = useState(initial.bank ?? '')
  const [from, setFrom] = useState(initial.from ?? '')
  const [to, setTo] = useState(initial.to ?? '')
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const filters = {
    status: status || undefined,
    waiterId: waiterId || undefined,
    bank: bank || undefined,
    from: from || undefined,
    to: to || undefined,
    page,
    pageSize: PAGE_SIZE,
  }

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['transactions', 'table', filters],
    queryFn: () => api.listTransactions(filters),
  })
  usePageRefresh(() => refetch())

  // Client-side attention filters (no backend param) layered on the page.
  const items = useMemo(() => {
    let list: Transaction[] = data?.items ?? []
    if (initial.duplicate) list = list.filter((t) => t.isDuplicate)
    if (initial.edited) list = list.filter((t) => t.editedByUploader)
    return list
  }, [data, initial.duplicate, initial.edited])

  // Build filter option lists from the current page.
  const waiterOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of data?.items ?? []) map.set(t.waiter.id, t.waiter.displayName)
    return Array.from(map, ([id, name]) => ({ id, name }))
  }, [data])

  const bankOptions = useMemo(() => {
    const set = new Set<string>()
    for (const t of data?.items ?? []) if (t.bankName) set.add(t.bankName)
    return Array.from(set)
  }, [data])

  async function onExport() {
    setExporting(true)
    setExportError(null)
    try {
      const blob = await api.exportTransactions({
        status: status || undefined,
        waiterId: waiterId || undefined,
        bank: bank || undefined,
        from: from || undefined,
        to: to || undefined,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `birr-track-transactions-${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  function resetPageAnd(setter: (v: string) => void) {
    return (v: string) => {
      setPage(1)
      setter(v)
    }
  }

  return (
    <div className="page">
      <PageHeader title="Transactions" subtitle="All business receipts" />

      <div className="toolbar">
        <div className="text-muted">{data ? `${data.total} total` : ''}</div>
        <button className="export-button" onClick={onExport} disabled={exporting}>
          {exporting ? 'Exporting…' : '⬇ Export Excel'}
        </button>
      </div>

      {exportError && <div className="inline-error">{exportError}</div>}

      <div className="filters-bar">
        <select value={status} onChange={(e) => resetPageAnd(setStatus as (v: string) => void)(e.target.value)}>
          <option value="">All statuses</option>
          <option value="needs_review">Needs review</option>
          <option value="recorded">Recorded</option>
        </select>
        <select value={waiterId} onChange={(e) => resetPageAnd(setWaiterId)(e.target.value)}>
          <option value="">All waiters</option>
          {waiterOptions.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select value={bank} onChange={(e) => resetPageAnd(setBank)(e.target.value)}>
          <option value="">All banks</option>
          {bankOptions.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <input type="date" value={from} onChange={(e) => resetPageAnd(setFrom)(e.target.value)} aria-label="From date" />
        <input type="date" value={to} onChange={(e) => resetPageAnd(setTo)(e.target.value)} aria-label="To date" />
      </div>

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="No transactions" hint="Try adjusting the filters." />
      ) : (
        <>
          <div className="transaction-list">
            {items.map((tx) => (
              <button
                key={tx.id}
                className="transaction-item"
                onClick={() => navigate(`/transactions/${tx.id}`)}
              >
                <div className="flex-between">
                  <div>
                    <div className="tx-bank">{tx.bankName || '?'}</div>
                    <div className="tx-waiter">{tx.waiter.displayName}</div>
                    <div className="tx-date text-muted">{formatShortDate(tx.timestamp ?? tx.createdAt)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="tx-amount">{formatEtb(tx.amount)}</div>
                    <div className="flex" style={{ gap: 4, marginTop: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      {tx.status === 'needs_review' && <span className="chip chip--warning">⚠️ Review</span>}
                      {tx.isDuplicate && <span className="chip chip--alert">Duplicate</span>}
                      {tx.editedByUploader && <span className="chip chip--alert">Edited</span>}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="pagination">
            <button className="action-button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ← Prev
            </button>
            <span className="page-indicator">Page {page}</span>
            <button
              className="action-button"
              disabled={!data?.hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  )
}
