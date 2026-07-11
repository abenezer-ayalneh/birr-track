import { getInitData } from '../../lib/telegram'

/**
 * Backend POST /auth/telegram response (AuthResponseDto).
 * Flat shape — no nested business object; the business name/status are not
 * carried here (see http client `me()` for how the Mini App assembles `Me`).
 */
export interface AuthResponse {
  accessToken: string
  sessionId: string
  refreshToken: string
  accessTokenExpiresAt: number
  sessionExpiresAt: number
  sessionIdleExpiresAt: number
  userId: string | null
  businessId: string | null
  role: 'waiter' | 'manager' | 'owner' | 'platform_owner'
  displayName: string
  language: 'en' | 'am'
}

/**
 * Holds the short-lived JWT and Admin Panel Session credential in memory only.
 * Telegram initData is used for the first exchange; renewals use /auth/refresh.
 */
export class AuthSession {
  private token: string | null = null
  private auth: AuthResponse | null = null
  private inFlight: Promise<AuthResponse> | null = null
  private heartbeatId: number | null = null
  private visibilityListenerAttached = false

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
    return this.authenticateFromTelegram()
  }

  /**
   * Force a fresh token by renewing the Admin Panel Session. Concurrent callers share a
   * single in-flight request so a burst of 401s doesn't fan out into many
   * /auth/refresh calls.
   */
  async refresh(): Promise<AuthResponse> {
    if (this.inFlight) return this.inFlight
    if (!this.auth) return this.authenticateFromTelegram()

    this.inFlight = (async () => {
      const res = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.auth?.sessionId, refreshToken: this.auth?.refreshToken }),
      })

      if (!res.ok) {
        const message = await readErrorMessage(res)
        this.clear()
        throw new Error(`Authentication refresh failed (${res.status}): ${message}`)
      }

      const auth = (await res.json()) as AuthResponse
      this.setAuth(auth)
      return auth
    })()

    try {
      return await this.inFlight
    } finally {
      this.inFlight = null
    }
  }

  async logout(): Promise<void> {
    const auth = this.auth
    this.clear()
    if (!auth) return

    await fetch(`${this.baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: auth.sessionId, refreshToken: auth.refreshToken }),
    }).catch(() => undefined)
  }

  clear(): void {
    this.token = null
    this.auth = null
    if (this.heartbeatId !== null) {
      window.clearTimeout(this.heartbeatId)
      this.heartbeatId = null
    }
  }

  setLanguage(language: 'en' | 'am'): void {
    if (this.auth) this.auth = { ...this.auth, language }
  }

  private async authenticateFromTelegram(): Promise<AuthResponse> {
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
      this.setAuth(auth)
      return auth
    })()

    try {
      return await this.inFlight
    } finally {
      this.inFlight = null
    }
  }

  private setAuth(auth: AuthResponse): void {
    this.token = auth.accessToken
    this.auth = auth
    this.attachVisibilityListener()
    this.scheduleHeartbeat()
  }

  private attachVisibilityListener(): void {
    if (this.visibilityListenerAttached || typeof document === 'undefined') return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.scheduleHeartbeat()
      } else if (this.heartbeatId !== null) {
        window.clearTimeout(this.heartbeatId)
        this.heartbeatId = null
      }
    })
    this.visibilityListenerAttached = true
  }

  private scheduleHeartbeat(): void {
    if (!this.auth || typeof document === 'undefined' || document.visibilityState !== 'visible') return
    if (this.heartbeatId !== null) window.clearTimeout(this.heartbeatId)

    const now = Math.floor(Date.now() / 1000)
    const secondsUntilIdle = this.auth.sessionIdleExpiresAt - now
    const secondsUntilAccessExpiry = this.auth.accessTokenExpiresAt - now
    const refreshInSeconds = Math.max(30, Math.min(secondsUntilIdle - 300, secondsUntilAccessExpiry - 60))

    this.heartbeatId = window.setTimeout(() => {
      if (document.visibilityState === 'visible') void this.refresh().catch(() => undefined)
    }, refreshInSeconds * 1000)
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
