import { useQuery } from '@tanstack/react-query'
import { useLocation } from 'wouter'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../components/PageHeader'
import { useApi } from '../lib/useApi'
import { usePageRefresh } from '../lib/useRefresh'
import { formatEtbCompact } from '../lib/format'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import '../styles/admin.css'

type Period = 'today' | 'week' | 'month' | 'custom'

/** Compute an inclusive [from, to] ISO date-time window (EAT-anchored) for a period. */
function rangeFor(period: Period, customFrom: string, customTo: string): { from?: string; to?: string } {
  if (period === 'custom') {
    return {
      from: customFrom ? `${customFrom}T00:00:00+03:00` : undefined,
      to: customTo ? `${customTo}T23:59:59+03:00` : undefined,
    }
  }
  // Anchor "now" in EAT by computing the EAT calendar date.
  const nowEat = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Addis_Ababa' }))
  const start = new Date(nowEat)
  if (period === 'week') {
    const day = (nowEat.getDay() + 6) % 7 // Monday = 0
    start.setDate(nowEat.getDate() - day)
  } else if (period === 'month') {
    start.setDate(1)
  }
  const y = start.getFullYear()
  const m = String(start.getMonth() + 1).padStart(2, '0')
  const d = String(start.getDate()).padStart(2, '0')
  return { from: `${y}-${m}-${d}T00:00:00+03:00` }
}

/**
 * Manager/Owner dashboard: period totals, per-waiter & per-bank breakdowns, and
 * attention counters that deep-link to the pre-filtered transactions table.
 */
export function Dashboard() {
  const api = useApi()
  const [, navigate] = useLocation()
  const { t } = useTranslation()
  const [period, setPeriod] = useState<Period>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const range = useMemo(() => rangeFor(period, customFrom, customTo), [period, customFrom, customTo])

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['summary', range],
    queryFn: () => api.getSummary(range),
    enabled: period !== 'custom' || Boolean(customFrom || customTo),
  })
  usePageRefresh(() => refetch())

  // For deep-linking the table, forward the date window as plain dates.
  const dateQuery = () => {
    const params = new URLSearchParams()
    if (range.from) params.set('from', range.from.slice(0, 10))
    if (range.to) params.set('to', range.to.slice(0, 10))
    return params
  }

  function goToTable(extra: Record<string, string>) {
    const params = dateQuery()
    for (const [k, v] of Object.entries(extra)) params.set(k, v)
    navigate(`/transactions?${params.toString()}`)
  }

  return (
    <div className="page">
      <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />

      <div className="period-tabs">
        {(['today', 'week', 'month', 'custom'] as const).map((p) => (
          <button key={p} className={`period-tab ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>
            {t(`dashboard.${p}`)}
          </button>
        ))}
      </div>

      {period === 'custom' && (
        <div className="custom-range">
          <div className="form-group">
            <label className="form-label">{t('common.from')}</label>
            <input className="form-input" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('common.to')}</label>
            <input className="form-input" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
        </div>
      )}

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => refetch()} />
      ) : !data ? (
        <EmptyState icon="📅" title={t('dashboard.pickRange')} hint={t('dashboard.chooseRange')} />
      ) : (
        <>
          <div className="summary-totals">
            <div className="stat-card">
              <div className="stat-label">{t('dashboard.totalRevenue')}</div>
              <div className="stat-value">{formatEtbCompact(data.totals.amount)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{t('dashboard.transactions')}</div>
              <div className="stat-value">{data.totals.count}</div>
            </div>
          </div>

          <div className="attention-grid">
            <button className="attention-card attention-card--review" onClick={() => goToTable({ status: 'needs_review' })}>
              <div className="attention-count">{data.attention.needsReview}</div>
              <div className="attention-label">{t('common.needsReview')}</div>
            </button>
            <button className="attention-card attention-card--dup" onClick={() => goToTable({ duplicate: '1' })}>
              <div className="attention-count">{data.attention.duplicates}</div>
              <div className="attention-label">{t('dashboard.duplicates')}</div>
            </button>
            <button className="attention-card attention-card--edit" onClick={() => goToTable({ edited: '1' })}>
              <div className="attention-count">{data.attention.edited}</div>
              <div className="attention-label">{t('common.edited')}</div>
            </button>
          </div>

          <div className="section-title">{t('dashboard.byWaiter')}</div>
          {data.perWaiter.length === 0 ? (
            <p className="text-muted">{t('dashboard.noData')}</p>
          ) : (
            data.perWaiter.map((row) => (
              <button
                key={row.key}
                className="breakdown-row full-width"
                style={{ background: 'transparent', textAlign: 'left' }}
                onClick={() => goToTable({ waiterId: row.key })}
              >
                <span className="breakdown-label">{row.label}</span>
                <span className="breakdown-meta">
                  <span className="breakdown-amount">{formatEtbCompact(row.amount)}</span>
                  <span className="breakdown-count"> · {row.count}</span>
                </span>
              </button>
            ))
          )}

          <div className="section-title">{t('dashboard.byBank')}</div>
          {data.perBank.length === 0 ? (
            <p className="text-muted">{t('dashboard.noData')}</p>
          ) : (
            data.perBank.map((row) => (
              <button
                key={row.key}
                className="breakdown-row full-width"
                style={{ background: 'transparent', textAlign: 'left' }}
                onClick={() => goToTable({ bank: row.label })}
              >
                <span className="breakdown-label">{row.label}</span>
                <span className="breakdown-meta">
                  <span className="breakdown-amount">{formatEtbCompact(row.amount)}</span>
                  <span className="breakdown-count"> · {row.count}</span>
                </span>
              </button>
            ))
          )}
        </>
      )}
    </div>
  )
}
