import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BusinessListing } from '../api/types'
import { PageHeader } from '../components/PageHeader'
import { useApi } from '../lib/useApi'
import { formatDate } from '../lib/format'
import { usePageRefresh } from '../lib/useRefresh'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import '../styles/admin.css'

type Tab = 'queue' | 'businesses'

function statusBadgeClass(status: BusinessListing['status']): string {
  return `status-badge status-badge--${status}`
}

/** Platform Owner views: pending registration queue and the businesses list. */
export function Registrations() {
  const [tab, setTab] = useState<Tab>('queue')
  const { t } = useTranslation()

  return (
    <div className="page">
      <PageHeader title={t('platform.title')} subtitle={t('platform.subtitle')} />

      <div className="period-tabs">
        <button className={`period-tab ${tab === 'queue' ? 'active' : ''}`} onClick={() => setTab('queue')}>
          {t('platform.registrations')}
        </button>
        <button className={`period-tab ${tab === 'businesses' ? 'active' : ''}`} onClick={() => setTab('businesses')}>
          {t('platform.businesses')}
        </button>
      </div>

      {tab === 'queue' ? <RegistrationQueue /> : <BusinessList statusBadge={statusBadgeClass} />}
    </div>
  )
}

function RegistrationQueue() {
  const api = useApi()
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['registrations'],
    queryFn: () => api.listRegistrations(),
  })
  usePageRefresh(() => refetch())

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['registrations'] })
    queryClient.invalidateQueries({ queryKey: ['businesses'] })
  }

  const approve = useMutation({ mutationFn: (id: string) => api.approveRegistration(id), onSuccess: invalidate })
  const reject = useMutation({ mutationFn: ({ id, reason }: { id: string; reason?: string }) => api.rejectRegistration(id, reason), onSuccess: invalidate })
  const busy = approve.isPending || reject.isPending
  const lastError = approve.error || reject.error

  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => refetch()} />

  const pending = (data ?? []).filter((r) => r.status === 'pending')
  if (pending.length === 0) return <EmptyState icon="✅" title={t('platform.noRegistrations')} hint={t('platform.caughtUp')} />

  return (
    <>
      {lastError && <div className="inline-error">{lastError instanceof Error ? lastError.message : t('common.actionFailed')}</div>}
      {pending.map((reg) => (
        <div key={reg.id} className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <div>
            <div className="list-name">{reg.businessName}</div>
            <div className="list-sub">
              {reg.registrant.displayName}
              {reg.registrant.username && <span> · @{reg.registrant.username}</span>}
              <span> · ID {reg.registrant.telegramUserId}</span>
            </div>
            <div className="list-sub">{t('platform.requested', { date: formatDate(reg.requestedAt) })}</div>
          </div>
          <div className="list-actions" style={{ justifyContent: 'flex-end' }}>
            <button
              className="action-button action-button--danger"
              disabled={busy}
              onClick={() => {
                const reason = window.prompt(t('platform.rejectReasonPrompt'))
                if (reason !== null) reject.mutate({ id: reg.id, reason })
              }}
            >
              {t('platform.reject')}
            </button>
            <button className="action-button action-button--primary" disabled={busy} onClick={() => approve.mutate(reg.id)}>
              {t('platform.approve')}
            </button>
          </div>
        </div>
      ))}
    </>
  )
}

function BusinessList({ statusBadge }: { statusBadge: (s: BusinessListing['status']) => string }) {
  const api = useApi()
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['businesses'],
    queryFn: () => api.listBusinesses(),
  })
  usePageRefresh(() => refetch())

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['businesses'] })
  const suspend = useMutation({ mutationFn: (id: string) => api.suspendBusiness(id), onSuccess: invalidate })
  const unsuspend = useMutation({ mutationFn: (id: string) => api.unsuspendBusiness(id), onSuccess: invalidate })
  const busy = suspend.isPending || unsuspend.isPending
  const lastError = suspend.error || unsuspend.error

  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => refetch()} />
  if ((data?.length ?? 0) === 0) return <EmptyState icon="🏢" title={t('platform.noBusinesses')} />

  return (
    <>
      {lastError && <div className="inline-error">{lastError instanceof Error ? lastError.message : t('common.actionFailed')}</div>}
      {data!.map((biz) => (
        <div key={biz.id} className="list-row">
          <div className="list-main">
            <div className="list-name">{biz.name}</div>
            <div className="list-sub">
              <span className={statusBadge(biz.status)}>{biz.status}</span>
              {biz.ownerName && <span> · {biz.ownerName}</span>}
            </div>
          </div>
          <div className="list-actions">
            {biz.status === 'suspended' ? (
              <button className="action-button action-button--primary" disabled={busy} onClick={() => unsuspend.mutate(biz.id)}>
                {t('platform.unsuspend')}
              </button>
            ) : biz.status === 'active' ? (
              <button className="action-button action-button--danger" disabled={busy} onClick={() => suspend.mutate(biz.id)}>
                {t('platform.suspend')}
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </>
  )
}
