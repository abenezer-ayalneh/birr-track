import { AuthSession, readErrorMessage } from './session'

/** Error carrying the HTTP status so callers/UI can branch on it. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface RequestOptions {
  method?: string
  /** JSON body — serialized automatically. */
  body?: unknown
  /** Query params appended to the URL (undefined/null values are skipped). */
  query?: Record<string, string | number | undefined>
  /** Response handling: parse JSON (default), return the raw Response, or no body. */
  responseType?: 'json' | 'blob' | 'response' | 'void'
}

/**
 * Authenticated fetch wrapper around the real backend.
 *
 * - Attaches the in-memory JWT as a Bearer header.
 * - On 401/403 (the backend's OptionalJwtAuthGuard returns `false` for an
 *   expired/absent token, which NestJS surfaces as 403 — not 401 — so we treat
 *   both as "token stale"), it re-exchanges initData once and retries.
 */
export class HttpFetcher {
  constructor(
    private readonly baseUrl: string,
    private readonly session: AuthSession,
  ) {}

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    await this.session.ensure()

    const doFetch = () => this.rawFetch(path, options)

    let res = await doFetch()

    // Token likely expired (JWT lives ~1h). Re-auth once and retry.
    if (res.status === 401 || res.status === 403) {
      await this.session.refresh()
      res = await doFetch()
    }

    if (!res.ok) {
      const message = await readErrorMessage(res)
      throw new ApiError(message, res.status)
    }

    return this.parse<T>(res, options.responseType ?? 'json')
  }

  private async rawFetch(path: string, options: RequestOptions): Promise<Response> {
    const url = new URL(`${this.baseUrl}${path}`)
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value))
        }
      }
    }

    const headers: Record<string, string> = {}
    const token = this.session.getToken()
    if (token) headers.Authorization = `Bearer ${token}`

    let body: BodyInit | undefined
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(options.body)
    }

    return fetch(url.toString(), {
      method: options.method ?? 'GET',
      headers,
      body,
    })
  }

  private async parse<T>(res: Response, type: NonNullable<RequestOptions['responseType']>): Promise<T> {
    switch (type) {
      case 'void':
        return undefined as T
      case 'blob':
        return (await res.blob()) as T
      case 'response':
        return res as unknown as T
      case 'json':
      default: {
        // Some endpoints (e.g. 204) have no body.
        const text = await res.text()
        return (text ? JSON.parse(text) : undefined) as T
      }
    }
  }
}
