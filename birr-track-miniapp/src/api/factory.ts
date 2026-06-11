import type { ApiClient } from './client'
import { HttpApiClient } from './http/client'
import { AuthSession } from './http/session'
import { mockApiClient } from './mock/client'

/**
 * Selects the API client by configuration: when VITE_API_BASE_URL is set we talk
 * to the real backend; otherwise we use the in-memory mock client (browser dev
 * mode with fake roles). This keeps chunk C's dev workflow fully working.
 */
export function createApiClient(): { client: ApiClient; isReal: boolean } {
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '')
  if (baseUrl) {
    const session = new AuthSession(baseUrl)
    return { client: new HttpApiClient(baseUrl, session), isReal: true }
  }
  return { client: mockApiClient, isReal: false }
}
