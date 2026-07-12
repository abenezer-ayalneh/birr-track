import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRole } from '../lib/useRole'
import { LoadingState } from '../components/States'
import { WaiterTransactions } from './WaiterTransactions'
import { TransactionsTable } from './TransactionsTable'

/**
 * The `/transactions` route is role-aware:
 * - Waiters see their own receipts ("My Receipts").
 * - Managers/Owners default to the business-wide table, but can flip to their
 *   own receipts ("My Receipts") per the role hierarchy (Owner ⊃ Manager ⊃ Waiter).
 */
export function TransactionsRoute() {
  const { role, isLoading } = useRole()
  const [view, setView] = useState<'business' | 'mine'>('business')
  const { t } = useTranslation()

  if (isLoading || !role) return <LoadingState />

  if (role === 'waiter') return <WaiterTransactions />

  // Manager / Owner: a small switch between the business table and own receipts.
  return (
    <div>
      <div style={{ padding: '12px 16px 0' }}>
        <div className="period-tabs">
          <button
            className={`period-tab ${view === 'business' ? 'active' : ''}`}
            onClick={() => setView('business')}
          >
            {t('transactions.business')}
          </button>
          <button
            className={`period-tab ${view === 'mine' ? 'active' : ''}`}
            onClick={() => setView('mine')}
          >
            {t('transactions.mineTitle')}
          </button>
        </div>
      </div>
      {view === 'business' ? <TransactionsTable /> : <WaiterTransactions ownView />}
    </div>
  )
}
