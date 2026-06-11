import { useLocation } from 'wouter'
import type { Role } from '../api/types'

const ICONS: Record<string, string> = {
  transactions: '📋',
  dashboard: '📊',
  staff: '👥',
  registrations: '✅',
}

interface NavItem {
  path: string
  label: string
  icon: string
  roles: Role[]
}

const NAV_ITEMS: NavItem[] = [
  { path: '/transactions', label: 'Transactions', icon: ICONS.transactions, roles: ['waiter', 'manager', 'owner'] },
  { path: '/dashboard', label: 'Dashboard', icon: ICONS.dashboard, roles: ['manager', 'owner'] },
  { path: '/staff', label: 'Staff', icon: ICONS.staff, roles: ['manager', 'owner'] },
  { path: '/registrations', label: 'Platform', icon: ICONS.registrations, roles: ['platform_owner'] },
]

export function Navigation({ role }: { role: Role }) {
  const [location, navigate] = useLocation()

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
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
