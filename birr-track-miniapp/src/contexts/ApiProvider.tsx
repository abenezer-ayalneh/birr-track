import type { ReactNode } from 'react'
import { ApiContext } from './ApiContext'
import type { ApiClient } from '../api/client'

export function ApiProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>
}
