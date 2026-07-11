import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { useRole } from '../lib/useRole'
import { useRefresh } from '../lib/useRefresh'
import { Navigation } from './Navigation'
import '../styles/layout.css'

const PULL_THRESHOLD = 72
const MAX_PULL = 96

export function Layout({ children }: { children: ReactNode }) {
  const { role, isLoading, error } = useRole()
  const { canRefresh, isRefreshing, refresh } = useRefresh()
  const mainRef = useRef<HTMLElement | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const [pullDistance, setPullDistance] = useState(0)
  const [isPulling, setIsPulling] = useState(false)

  function beginPull(e: PointerEvent<HTMLElement>) {
    if (e.pointerType === 'mouse' || !canRefresh || isRefreshing || mainRef.current?.scrollTop !== 0) return
    startRef.current = { x: e.clientX, y: e.clientY }
  }

  function movePull(e: PointerEvent<HTMLElement>) {
    const start = startRef.current
    if (!start || !mainRef.current || mainRef.current.scrollTop !== 0) return

    const deltaY = e.clientY - start.y
    const deltaX = Math.abs(e.clientX - start.x)
    if (deltaY <= 0 || deltaX > deltaY) return

    e.preventDefault()
    setIsPulling(true)
    setPullDistance(Math.min(MAX_PULL, deltaY * 0.45))
  }

  function endPull() {
    const shouldRefresh = pullDistance >= PULL_THRESHOLD
    startRef.current = null
    setIsPulling(false)
    setPullDistance(0)
    if (shouldRefresh) void refresh()
  }

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
      <main
        ref={mainRef}
        className="layout-main"
        onPointerDown={beginPull}
        onPointerMove={movePull}
        onPointerUp={endPull}
        onPointerCancel={endPull}
        onPointerLeave={endPull}
      >
        <div
          className={`pull-refresh ${isPulling || isRefreshing ? 'pull-refresh--visible' : ''}`}
          style={{ transform: `translateY(${isRefreshing ? 0 : pullDistance - 44}px)` }}
        >
          <span className={isRefreshing ? 'pull-refresh-icon pull-refresh-icon--spinning' : 'pull-refresh-icon'}>
            ↻
          </span>
          <span>{isRefreshing ? 'Refreshing' : pullDistance >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}</span>
        </div>
        {children}
      </main>
      <Navigation role={role} />
    </div>
  )
}
