import { useEffect } from 'react'
import { useLocation } from 'wouter'
import { useRole } from '../lib/useRole'
import { LoadingState } from '../components/States'

/**
 * Landing redirect: send each role to its natural first view.
 * Platform Owners have no transactions view, so they land on the platform queue.
 */
export function Home() {
  const { role, isLoading } = useRole()
  const [, navigate] = useLocation()

  useEffect(() => {
    if (isLoading || !role) return
    navigate(role === 'platform_owner' ? '/registrations' : '/transactions', { replace: true })
  }, [role, isLoading, navigate])

  return <LoadingState />
}
