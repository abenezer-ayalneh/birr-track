import { useQuery } from '@tanstack/react-query'
import { useLocation } from 'wouter'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Transaction, TransactionStatus } from '../api/types'
import { PageHeader } from '../components/PageHeader'
import { useApi } from '../lib/useApi'
import { useRole } from '../lib/useRole'
import { formatEtb, formatShortDate } from '../lib/format'
import { usePageRefresh } from '../lib/useRefresh'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import '../styles/waiter.css'

/**
 * "My Receipts" view. For Waiters the backend already scopes the list to their
 * own transactions. For Managers/Owners using the `ownView` toggle, the list is
 * business-wide, so we filter to their own userId client-side.
 */
export function WaiterTransactions({ ownView = false }: { ownView?: boolean }) {
  const api = useApi()
  const { me } = useRole()
  const [, navigate] = useLocation()
  const { t } = useTranslation()
  const [status, setStatus] = useState<TransactionStatus>('needs_review')

  const { data: page, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['transactions', 'mine', { status }],
    queryFn: () => api.listTransactions({ status }),
  })
  usePageRefresh(() => refetch())

  const transactions = useMemo(() => {
    let list: Transaction[] = page?.items ?? []
    // Manager/owner own-view: keep only the current user's receipts.
    if (ownView && me?.userId) list = list.filter((t) => t.waiter.id === me.userId)
    return list
  }, [page, ownView, me?.userId])

  return (
    <div className="page">
      <PageHeader
        title={t('transactions.mineTitle')}
        subtitle={
          transactions.length === 0
            ? t('common.allCaughtUp')
            : transactions.length === 1
              ? t('transactions.count_one')
              : t('transactions.count_other', { count: transactions.length })
        }
      />

      <div className="filter-tabs">
        {(['needs_review', 'recorded'] as const).map((s) => (
          <button
            key={s}
            className={`filter-tab ${status === s ? 'active' : ''}`}
            onClick={() => setStatus(s)}
          >
            {s === 'needs_review' ? `⚠️ ${t('common.needsReview')}` : `✓ ${t('common.recorded')}`}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => refetch()} />
      ) : transactions.length === 0 ? (
        <EmptyState
          icon="✅"
          title={status === 'needs_review' ? t('transactions.emptyReview') : t('transactions.emptyRecorded')}
          hint={status === 'needs_review' ? t('common.allCaughtUp') : undefined}
        />
      ) : (
        <div className="transaction-list">
          {transactions.map((tx) => (
            <button
              key={tx.id}
              className="transaction-item"
              onClick={() => navigate(`/transactions/${tx.id}`)}
            >
              <div className="flex-between">
                <div>
                  <div className="tx-bank">{tx.bankName || '?'}</div>
                  <div className="tx-date text-muted">{formatShortDate(tx.timestamp ?? tx.createdAt)}</div>
                </div>
                <div className="flex-between" style={{ gap: '8px', alignItems: 'flex-start' }}>
                  <div className="tx-amount">{formatEtb(tx.amount)}</div>
                  <div className="flex" style={{ gap: '4px', marginTop: '2px' }}>
                    {tx.status === 'needs_review' && <span className="chip chip--warning">⚠️</span>}
                    {tx.isDuplicate && <span className="chip chip--alert">{t('common.duplicate')}</span>}
                    {tx.editedByUploader && <span className="chip chip--alert">{t('common.edited')}</span>}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
