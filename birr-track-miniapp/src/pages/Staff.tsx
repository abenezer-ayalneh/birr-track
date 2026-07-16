import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type MouseEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Invite, StaffMember } from '../api/types'
import { PageHeader } from '../components/PageHeader'
import { useApi } from '../lib/useApi'
import { useRole } from '../lib/useRole'
import { formatDate } from '../lib/format'
import { usePageRefresh } from '../lib/useRefresh'
import { closeTelegramMiniApp, tryOpenTelegramLink } from '../lib/telegram'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { ConfirmDialog } from '../components/ConfirmDialog'
import '../styles/admin.css'

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME

function roleBadgeClass(role: StaffMember['role']): string {
  return role === 'owner' ? 'role-badge role-badge--owner' : role === 'manager' ? 'role-badge role-badge--manager' : 'role-badge'
}

/**
 * Staff management. Action visibility follows the spec's rule:
 * - Managers can remove Waiters.
 * - Only the Owner promotes/demotes/removes Managers.
 * - Nobody touches the Owner.
 */
export function Staff() {
  const api = useApi()
  const queryClient = useQueryClient()
  const { role: myRole } = useRole()
  const { t } = useTranslation()
  const [removalTarget, setRemovalTarget] = useState<StaffMember | null>(null)
  const [removalReason, setRemovalReason] = useState('')

  const staffQuery = useQuery({ queryKey: ['staff'], queryFn: () => api.listStaff() })
  const invitesQuery = useQuery({ queryKey: ['invites'], queryFn: () => api.listInvites() })
  usePageRefresh(() => Promise.all([staffQuery.refetch(), invitesQuery.refetch()]))

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['staff'] })
    queryClient.invalidateQueries({ queryKey: ['invites'] })
  }

  const promote = useMutation({ mutationFn: (id: string) => api.promoteToManager(id), onSuccess: invalidate })
  const demote = useMutation({ mutationFn: (id: string) => api.demoteToWaiter(id), onSuccess: invalidate })
  const remove = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.removeStaff(id, reason),
    onSuccess: () => {
      invalidate()
      setRemovalTarget(null)
      setRemovalReason('')
    },
  })
  const revoke = useMutation({ mutationFn: (id: string) => api.revokeInvite(id), onSuccess: invalidate })

  const mutating = promote.isPending || demote.isPending || remove.isPending
  const lastError =
    promote.error || demote.error || remove.error || revoke.error || undefined

  const isOwner = myRole === 'owner'

  function canRemove(member: StaffMember): boolean {
    if (member.role === 'owner') return false
    if (member.role === 'manager') return isOwner
    return true // waiter — manager or owner can remove
  }

  function inviteHref(): string | undefined {
    return BOT_USERNAME ? `https://t.me/${BOT_USERNAME}?start=invite` : undefined
  }

  function handleInviteClick(event: MouseEvent<HTMLAnchorElement>): void {
    const href = inviteHref()
    if (href && tryOpenTelegramLink(href)) {
      event.preventDefault()
      closeTelegramMiniApp()
    }
  }

  return (
    <div className="page">
      <PageHeader title={t('staff.title')} subtitle={t('staff.subtitle')} />

      {inviteHref() ? (
        <a
          className="invite-button"
          href={inviteHref()}
          target="_blank"
          rel="noreferrer"
          style={{ display: 'block', textAlign: 'center' }}
          onClick={handleInviteClick}
        >
          ＋ {t('staff.inviteSomeone')}
        </a>
      ) : (
        <div className="text-muted mb-2">{t('staff.inviteViaBot')}</div>
      )}

      {lastError && (
        <div className="inline-error">{lastError instanceof Error ? lastError.message : t('common.actionFailed')}</div>
      )}

      <div className="section-title">{t('staff.members')}</div>
      {staffQuery.isLoading ? (
        <LoadingState />
      ) : staffQuery.isError ? (
        <ErrorState
          message={staffQuery.error instanceof Error ? staffQuery.error.message : undefined}
          onRetry={() => staffQuery.refetch()}
        />
      ) : (staffQuery.data?.length ?? 0) === 0 ? (
        <EmptyState icon="👥" title={t('staff.noMembers')} />
      ) : (
        staffQuery.data!.map((member) => (
          <div key={member.userId} className="list-row">
            <div className="list-main">
              <div className="list-name">{member.displayName}</div>
              <div className="list-sub">
                <span className={roleBadgeClass(member.role)}>{member.role}</span>
                {member.telegramUsername && <span> · @{member.telegramUsername}</span>}
              </div>
            </div>
            <div className="list-actions">
              {isOwner && member.role === 'waiter' && (
                <button className="action-button action-button--primary" disabled={mutating} onClick={() => promote.mutate(member.userId)}>
                  {t('staff.promote')}
                </button>
              )}
              {isOwner && member.role === 'manager' && (
                <button className="action-button" disabled={mutating} onClick={() => demote.mutate(member.userId)}>
                  {t('staff.demote')}
                </button>
              )}
              {canRemove(member) && (
                <button className="action-button action-button--danger" disabled={mutating} onClick={() => setRemovalTarget(member)}>
                  {t('staff.remove')}
                </button>
              )}
            </div>
          </div>
        ))
      )}

      {removalTarget && (
        <ConfirmDialog
          title={t('staff.removeConfirmTitle')}
          confirmLabel={remove.isPending ? t('staff.removing') : t('staff.remove')}
          cancelLabel={t('common.cancel')}
          busy={remove.isPending}
          onConfirm={() => remove.mutate({ id: removalTarget.userId, reason: removalReason })}
          onCancel={() => {
            setRemovalTarget(null)
            setRemovalReason('')
          }}
        >
          <p>{t('staff.removeConfirmBody', { displayName: removalTarget.displayName })}</p>
          <label className="form-label" htmlFor="remove-reason">{t('staff.removeReason')}</label>
          <textarea
            id="remove-reason"
            className="form-input"
            value={removalReason}
            maxLength={500}
            placeholder={t('staff.removeReasonPlaceholder')}
            onChange={(event) => setRemovalReason(event.target.value)}
          />
        </ConfirmDialog>
      )}

      <div className="section-title">{t('staff.pendingInvites')}</div>
      {invitesQuery.isLoading ? (
        <LoadingState />
      ) : invitesQuery.isError ? (
        <ErrorState
          message={invitesQuery.error instanceof Error ? invitesQuery.error.message : undefined}
          onRetry={() => invitesQuery.refetch()}
        />
      ) : (invitesQuery.data?.filter((i) => i.status === 'pending').length ?? 0) === 0 ? (
        <EmptyState icon="✉️" title={t('staff.noInvites')} />
      ) : (
        invitesQuery
          .data!.filter((i: Invite) => i.status === 'pending')
          .map((invite) => (
            <div key={invite.id} className="list-row">
              <div className="list-main">
                <div className="list-name">{invite.inviteeName}</div>
                <div className="list-sub">
                  <span className={roleBadgeClass(invite.role)}>{invite.role}</span>
                  <span> · {t('staff.expires', { date: formatDate(invite.expiresAt) })}</span>
                </div>
              </div>
              <div className="list-actions">
                <button
                  className="action-button action-button--danger"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(invite.id)}
                >
                  {t('staff.revoke')}
                </button>
              </div>
            </div>
          ))
      )}
    </div>
  )
}
