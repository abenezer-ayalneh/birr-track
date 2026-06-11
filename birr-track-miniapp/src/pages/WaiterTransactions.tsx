import { useQuery } from '@tanstack/react-query'
import { useLocation } from 'wouter'
import { useState } from 'react'
import type { TransactionStatus } from '../api/types'
import { useApi } from '../lib/useApi'
import '../styles/waiter.css'

export function WaiterTransactions() {
  const api = useApi()
  const [, navigate] = useLocation()
  const [status, setStatus] = useState<TransactionStatus>('needs_review')

  const { data: page, isLoading } = useQuery({
    queryKey: ['transactions', { status }],
    queryFn: () => api.listTransactions({ status }),
  })

  const transactions = page?.items || []

  if (isLoading) {
    return (
      <div className="page text-center">
        <div className="spinner"></div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">My Receipts</h1>
        <p className="page-subtitle">
          {transactions.length === 0
            ? 'All caught up!'
            : transactions.length === 1
              ? '1 receipt needs attention'
              : `${transactions.length} receipts need attention`}
        </p>
      </div>

      <div className="filter-tabs">
        {(['needs_review', 'recorded'] as const).map((s) => (
          <button
            key={s}
            className={`filter-tab ${status === s ? 'active' : ''}`}
            onClick={() => setStatus(s)}
          >
            {s === 'needs_review' ? '⚠️ Needs Review' : '✓ Recorded'}
          </button>
        ))}
      </div>

      <div className="transaction-list">
        {transactions.length === 0 ? (
          <p className="text-center text-muted mt-2">No transactions to show.</p>
        ) : (
          transactions.map((tx) => (
            <button
              key={tx.id}
              className="transaction-item"
              onClick={() => navigate(`/transactions/${tx.id}`)}
            >
              <div className="flex-between">
                <div>
                  <div className="tx-bank">{tx.bankName || '?'}</div>
                  <div className="tx-date text-muted">
                    {new Date(tx.createdAt).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </div>
                </div>
                <div className="flex-between" style={{ gap: '8px', alignItems: 'flex-start' }}>
                  <div className="tx-amount">
                    {tx.amount ? `ETB ${tx.amount.toFixed(2)}` : '—'}
                  </div>
                  <div className="flex" style={{ gap: '4px', marginTop: '2px' }}>
                    {tx.status === 'needs_review' && <span className="chip chip--warning">⚠️</span>}
                    {tx.isDuplicate && <span className="chip chip--alert">Duplicate</span>}
                    {tx.editedByUploader && <span className="chip chip--alert">Edited</span>}
                  </div>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
