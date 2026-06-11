import type { ReactNode } from 'react'
import { useRole } from '../lib/useRole'
import { Navigation } from './Navigation'
import '../styles/layout.css'

export function Layout({ children }: { children: ReactNode }) {
  const { role, isLoading, error } = useRole()

  if (isLoading) {
    return (
      <div className="layout full-height flex-center">
        <div className="spinner"></div>
      </div>
    )
  }

  if (error || !role) {
    return (
      <div className="layout full-height flex-center">
        <div className="text-center px-4">
          <p className="text-muted">Failed to load user profile</p>
          <p className="text-muted mt-1">{error?.message || 'Unknown error'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="layout full-height">
      <main className="layout-main">{children}</main>
      <Navigation role={role} />
    </div>
  )
}
