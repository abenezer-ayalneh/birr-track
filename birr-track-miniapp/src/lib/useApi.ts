import { useContext } from 'react'
import { ApiContext } from '../contexts/ApiContext'

export function useApi() {
  const ctx = useContext(ApiContext)
  if (!ctx) {
    throw new Error('useApi must be used within <ApiProvider>')
  }
  return ctx
}
