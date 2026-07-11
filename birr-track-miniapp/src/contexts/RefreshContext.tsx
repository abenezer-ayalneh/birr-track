import { createContext } from 'react'

export type RefreshAction = () => Promise<unknown> | unknown

export interface RefreshContextValue {
  isRefreshing: boolean
  canRefresh: boolean
  refresh: () => Promise<void>
  registerRefresh: (action: RefreshAction) => () => void
}

export const RefreshContext = createContext<RefreshContextValue | null>(null)
