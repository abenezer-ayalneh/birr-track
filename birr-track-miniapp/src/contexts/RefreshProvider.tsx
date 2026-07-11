import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { RefreshContext, type RefreshAction } from './RefreshContext'

export function RefreshProvider({ children }: { children: ReactNode }) {
  const actionRef = useRef<RefreshAction | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [canRefresh, setCanRefresh] = useState(false)

  const registerRefresh = useCallback((action: RefreshAction) => {
    actionRef.current = action
    setCanRefresh(true)

    return () => {
      if (actionRef.current === action) {
        actionRef.current = null
        setCanRefresh(false)
      }
    }
  }, [])

  const refresh = useCallback(async () => {
    const action = actionRef.current
    if (!action || isRefreshing) return

    setIsRefreshing(true)
    try {
      await action()
    } finally {
      setIsRefreshing(false)
    }
  }, [isRefreshing])

  const value = useMemo(
    () => ({ isRefreshing, canRefresh, refresh, registerRefresh }),
    [canRefresh, isRefreshing, refresh, registerRefresh],
  )

  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>
}
