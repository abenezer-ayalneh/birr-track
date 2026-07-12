import { useLocation } from 'wouter'
import { useTranslation } from 'react-i18next'
import type { Role } from '../api/types'

const ICONS: Record<string, string> = {
  transactions: '📋',
  dashboard: '📊',
  staff: '👥',
  registrations: '✅',
}

interface NavItem {
  path: string
  labelKey: string
  icon: string
  roles: Role[]
}

const NAV_ITEMS: NavItem[] = [
  { path: '/transactions', labelKey: 'nav.transactions', icon: ICONS.transactions, roles: ['waiter', 'manager', 'owner'] },
  { path: '/dashboard', labelKey: 'nav.dashboard', icon: ICONS.dashboard, roles: ['manager', 'owner'] },
  { path: '/staff', labelKey: 'nav.staff', icon: ICONS.staff, roles: ['manager', 'owner'] },
  { path: '/registrations', labelKey: 'nav.platform', icon: ICONS.registrations, roles: ['platform_owner'] },
]

export function Navigation({ role }: { role: Role }) {
  const [location, navigate] = useLocation()
  const { t } = useTranslation()

  const items = NAV_ITEMS.filter((item) => item.roles.includes(role))

  return (
    <nav className="navigation">
      {items.map((item) => (
        <button
          key={item.path}
          className={`nav-button ${location === item.path ? 'active' : ''}`}
          onClick={() => navigate(item.path)}
        >
          <span className="nav-icon">{item.icon}</span>
          <span>{t(item.labelKey)}</span>
        </button>
      ))}
    </nav>
  )
}
