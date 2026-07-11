import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Invite, StaffMember } from '../api/types'
import { PageHeader } from '../components/PageHeader'
import { useApi } from '../lib/useApi'
import { useRole } from '../lib/useRole'
import { formatDate } from '../lib/format'
import { usePageRefresh } from '../lib/useRefresh'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
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

  const staffQuery = useQuery({ queryKey: ['staff'], queryFn: () => api.listStaff() })
  const invitesQuery = useQuery({ queryKey: ['invites'], queryFn: () => api.listInvites() })
  usePageRefresh(() => Promise.all([staffQuery.refetch(), invitesQuery.refetch()]))

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['staff'] })
    queryClient.invalidateQueries({ queryKey: ['invites'] })
  }

  const promote = useMutation({ mutationFn: (id: string) => api.promoteToManager(id), onSuccess: invalidate })
  const demote = useMutation({ mutationFn: (id: string) => api.demoteToWaiter(id), onSuccess: invalidate })
  const remove = useMutation({ mutationFn: (id: string) => api.removeStaff(id), onSuccess: invalidate })
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
    return BOT_USERNAME ? `https://t.me/${BOT_USERNAME}` : undefined
  }

  return (
    <div className="page">
      <PageHeader title="Staff" subtitle="Team members & pending invites" />

      {inviteHref() ? (
        <a className="invite-button" href={inviteHref()} target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', color: '#fff' }}>
          ＋ Invite someone
        </a>
      ) : (
        <div className="text-muted mb-2">Invite via the bot's /invite command (bot username not configured).</div>
      )}

      {lastError && (
        <div className="inline-error">{lastError instanceof Error ? lastError.message : 'Action failed'}</div>
      )}

      <div className="section-title">Members</div>
      {staffQuery.isLoading ? (
        <LoadingState />
      ) : staffQuery.isError ? (
        <ErrorState
          message={staffQuery.error instanceof Error ? staffQuery.error.message : undefined}
          onRetry={() => staffQuery.refetch()}
        />
      ) : (staffQuery.data?.length ?? 0) === 0 ? (
        <EmptyState icon="👥" title="No members yet" />
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
                  Promote
                </button>
              )}
              {isOwner && member.role === 'manager' && (
                <button className="action-button" disabled={mutating} onClick={() => demote.mutate(member.userId)}>
                  Demote
                </button>
              )}
              {canRemove(member) && (
                <button className="action-button action-button--danger" disabled={mutating} onClick={() => remove.mutate(member.userId)}>
                  Remove
                </button>
              )}
            </div>
          </div>
        ))
      )}

      <div className="section-title">Pending invites</div>
      {invitesQuery.isLoading ? (
        <LoadingState />
      ) : invitesQuery.isError ? (
        <ErrorState
          message={invitesQuery.error instanceof Error ? invitesQuery.error.message : undefined}
          onRetry={() => invitesQuery.refetch()}
        />
      ) : (invitesQuery.data?.filter((i) => i.status === 'pending').length ?? 0) === 0 ? (
        <EmptyState icon="✉️" title="No pending invites" />
      ) : (
        invitesQuery
          .data!.filter((i: Invite) => i.status === 'pending')
          .map((invite) => (
            <div key={invite.id} className="list-row">
              <div className="list-main">
                <div className="list-name">{invite.inviteeName}</div>
                <div className="list-sub">
                  <span className={roleBadgeClass(invite.role)}>{invite.role}</span>
                  <span> · expires {formatDate(invite.expiresAt)}</span>
                </div>
              </div>
              <div className="list-actions">
                <button
                  className="action-button action-button--danger"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(invite.id)}
                >
                  Revoke
                </button>
              </div>
            </div>
          ))
      )}
    </div>
  )
}
