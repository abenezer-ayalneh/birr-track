import { useContext, useEffect, useRef } from 'react'
import { RefreshContext, type RefreshAction } from '../contexts/RefreshContext'

export function useRefresh() {
  const ctx = useContext(RefreshContext)
  if (!ctx) {
    throw new Error('useRefresh must be used within <RefreshProvider>')
  }
  return ctx
}

export function usePageRefresh(action: RefreshAction) {
  const { registerRefresh } = useRefresh()
  const actionRef = useRef(action)

  useEffect(() => {
    actionRef.current = action
  }, [action])

  useEffect(() => registerRefresh(() => actionRef.current()), [registerRefresh])
}
