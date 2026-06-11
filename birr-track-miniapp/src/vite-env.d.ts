/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the real backend (e.g. https://api.birrtrack.et). When set, the
   * app uses the real HTTP API client; when unset, it falls back to the mock
   * client + fake dev roles (browser dev mode).
   */
  readonly VITE_API_BASE_URL?: string
  /** Telegram bot username (without @) used to deep-link the staff "invite" action. */
  readonly VITE_BOT_USERNAME?: string
  /** Dev-only: default role for the browser/mock fallback (waiter | manager | owner | platform_owner). */
  readonly VITE_DEV_ROLE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
