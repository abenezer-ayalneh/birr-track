/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev-only: default role for the browser fallback (waiter | manager | owner | platform_owner). */
  readonly VITE_DEV_ROLE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
