import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorState, LoadingState } from '../components/States'
import { PageHeader } from '../components/PageHeader'
import { closeTelegramMiniApp } from '../lib/telegram'
import { useApi } from '../lib/useApi'
import '../styles/admin.css'

export function Account() {
  const api = useApi()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const [confirmingLeave, setConfirmingLeave] = useState(false)
  const [leftBusinessName, setLeftBusinessName] = useState<string | null>(null)

  const accountQuery = useQuery({ queryKey: ['account'], queryFn: () => api.getAccount(), enabled: !leftBusinessName })
  const leave = useMutation({
    mutationFn: () => api.leaveBusiness(),
    onSuccess: () => {
      const businessName = accountQuery.data?.business.name ?? t('account.thisBusiness')

			// Keep the current identity query alive long enough to render the signed-out
			// confirmation screen; the HTTP session itself has already been cleared.
      queryClient.removeQueries({ queryKey: ['account'] })
      setLeftBusinessName(businessName)
      setConfirmingLeave(false)
    },
  })

  if (leftBusinessName) {
    return (
      <div className="page account-page">
        <h1 className="page-title">{t('account.leftTitle')}</h1>
        <div className="account-card">
          <p>{t('account.leftMessage', { businessName: leftBusinessName })}</p>
          <p className="text-muted">{t('account.leftHint')}</p>
          <button className="button-primary" onClick={closeTelegramMiniApp}>{t('account.close')}</button>
        </div>
      </div>
    )
  }

  if (accountQuery.isLoading) return <LoadingState />
  if (accountQuery.isError || !accountQuery.data) {
    return <ErrorState message={accountQuery.error instanceof Error ? accountQuery.error.message : undefined} onRetry={() => accountQuery.refetch()} />
  }

  const account = accountQuery.data
  const canLeave = account.role === 'waiter' || account.role === 'manager'

  return (
    <div className="page account-page">
      <PageHeader title={t('account.title')} subtitle={t('account.subtitle')} />
      <div className="account-card">
        <div className="account-row"><span>{t('account.name')}</span><strong>{account.displayName}</strong></div>
        <div className="account-row"><span>{t('account.role')}</span><strong>{account.role}</strong></div>
        <div className="account-row"><span>{t('account.business')}</span><strong>{account.business.name}</strong></div>
      </div>

      {canLeave ? (
        <div className="account-danger-zone">
          <h2>{t('account.leaveTitle')}</h2>
          <p>{t('account.leaveDescription')}</p>
          {leave.isError && <div className="inline-error">{leave.error instanceof Error ? leave.error.message : t('common.actionFailed')}</div>}
          <button className="action-button action-button--danger" disabled={leave.isPending} onClick={() => setConfirmingLeave(true)}>{t('account.leave')}</button>
        </div>
      ) : (
        <div className="account-card text-muted">{t('account.ownerCannotLeave')}</div>
      )}

      {confirmingLeave && (
        <ConfirmDialog
          title={t('account.confirmTitle')}
          confirmLabel={leave.isPending ? t('account.leaving') : t('account.leave')}
          cancelLabel={t('common.cancel')}
          busy={leave.isPending}
          onConfirm={() => leave.mutate()}
          onCancel={() => setConfirmingLeave(false)}
        >
          <p>{t('account.confirmBody', { businessName: account.business.name })}</p>
          <p className="text-muted">{t('account.confirmHint')}</p>
        </ConfirmDialog>
      )}
    </div>
  )
}
