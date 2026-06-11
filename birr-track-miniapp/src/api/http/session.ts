import { getInitData } from '../../lib/telegram'

/**
 * Backend POST /auth/telegram response (AuthResponseDto).
 * Flat shape — no nested business object; the business name/status are not
 * carried here (see http client `me()` for how the Mini App assembles `Me`).
 */
export interface AuthResponse {
  accessToken: string
  userId: string | null
  businessId: string | null
  role: 'waiter' | 'manager' | 'owner' | 'platform_owner'
  displayName: string
}

/**
 * Holds the short-lived (1-hour) JWT in memory only — never localStorage, per
 * the spec. The initData is always available in-session, so on expiry we
 * transparently re-exchange it for a fresh token.
 */
export class AuthSession {
  private token: string | null = null
  private auth: AuthResponse | null = null
  private inFlight: Promise<AuthResponse> | null = null

  constructor(private readonly baseUrl: string) {}

  getToken(): string | null {
    return this.token
  }

  /** The last successful auth response (userId/businessId/role/displayName). */
  getAuth(): AuthResponse | null {
    return this.auth
  }

  /** Returns a valid token, exchanging initData if we don't have one yet. */
  async ensure(): Promise<AuthResponse> {
    if (this.auth) return this.auth
    return this.refresh()
  }

  /**
   * Force a fresh token by re-exchanging initData. Concurrent callers share a
   * single in-flight request so a burst of 401s doesn't fan out into many
   * /auth/telegram calls.
   */
  async refresh(): Promise<AuthResponse> {
    if (this.inFlight) return this.inFlight

    this.inFlight = (async () => {
      const initData = getInitData()
      const res = await fetch(`${this.baseUrl}/auth/telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      })

      if (!res.ok) {
        const message = await readErrorMessage(res)
        throw new Error(`Authentication failed (${res.status}): ${message}`)
      }

      const auth = (await res.json()) as AuthResponse
      this.token = auth.accessToken
      this.auth = auth
      return auth
    })()

    try {
      return await this.inFlight
    } finally {
      this.inFlight = null
    }
  }

  clear(): void {
    this.token = null
    this.auth = null
  }
}

/** Pulls a human-readable message out of the backend's error envelope. */
export async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.clone().json()) as { message?: string; errorType?: string }
    return body.message || body.errorType || res.statusText
  } catch {
    return res.statusText
  }
}
