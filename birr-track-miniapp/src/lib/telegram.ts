/**
 * Telegram Mini App SDK initialization with a browser dev fallback.
 *
 * - Inside Telegram, the real `initData` is retrieved from @telegram-apps/sdk and
 *   exchanged with the backend (POST /auth/telegram) for a JWT.
 * - In a plain browser (dev/mock mode), a fake `initData` is synthesized whose
 *   role is chosen via VITE_DEV_ROLE or a `?role=` query param. The backend never
 *   sees this fake data — it is only consumed by the mock API client.
 *
 * `mock vs real` is selected in App.tsx by whether VITE_API_BASE_URL is set; this
 * module only knows how to produce an initData string for whichever path runs.
 */

import { closeMiniApp, init as initTelegramSdk, isTMA, retrieveRawInitData } from '@telegram-apps/sdk'

import type { Role } from '../api/types'
import { setMockRole } from '../api/mock/client'

let _cachedInitData = ''
let _isInTelegram = false
let _sdkInitialized = false

/**
 * Dev fallback initData. The role comes from VITE_DEV_ROLE env var or the
 * `role=` query param (query param wins). This is NOT a valid Telegram HMAC and
 * is only ever passed to the mock client.
 * Format: https://core.telegram.org/bots/webapps#validating-data-received-from-the-web-app
 */
function devInitData(role: Role): string {
  const user = {
    id: 111111111 + Math.floor(Math.random() * 100000),
    is_bot: false,
    first_name:
      role === 'platform_owner'
        ? 'Addis'
        : role === 'owner'
          ? 'Amina'
          : role === 'manager'
            ? 'Yusuf'
            : 'Kalkidan',
    last_name:
      role === 'platform_owner'
        ? 'Admin'
        : role === 'owner'
          ? 'Kebede'
          : role === 'manager'
            ? 'Mohamed'
            : 'Tesfaye',
    username: role === 'platform_owner' ? 'addis_admin' : `user_${role}`,
    language_code: 'en',
  }

  const initDataMap = new URLSearchParams({
    user: JSON.stringify(user),
    auth_date: String(Math.floor(Date.now() / 1000)),
    hash: 'mock_hash_' + role,
  })

  return initDataMap.toString()
}

export async function initTelegram(): Promise<void> {
  // Detect a genuine Telegram Mini App environment.
  try {
    _isInTelegram = isTMA()
  } catch {
    _isInTelegram = false
  }

  if (_isInTelegram) {
    try {
      if (!_sdkInitialized) {
        initTelegramSdk()
        _sdkInitialized = true
      }
      const raw = retrieveRawInitData()
      if (raw) {
        _cachedInitData = raw
        return
      }
    } catch {
      // Fall through to dev fallback below.
    }
  }

  // Dev fallback: synthesize initData with a role from env or query param.
  const urlParams = new URLSearchParams(window.location.search)
  const queryRole = urlParams.get('role') as Role | null
  const envRole = (import.meta.env.VITE_DEV_ROLE || 'waiter') as Role
  const role = queryRole || envRole

  _cachedInitData = devInitData(role)
  setMockRole(role)

  console.log(
    `[Dev] Running with role="${role}". Switch via ?role=manager|owner|platform_owner or VITE_DEV_ROLE env.`,
  )
}

/** The raw initData string to exchange for a JWT (real) or feed the mock client. */
export function getInitData(): string {
  return _cachedInitData
}

/** True only when running inside a real Telegram Mini App. */
export function isInTelegram(): boolean {
  return _isInTelegram
}

/** Close the Mini App in Telegram; browser development falls back to closing the tab when possible. */
export function closeTelegramMiniApp(): void {
  try {
    if (_isInTelegram) {
      closeMiniApp()
      return
    }
  } catch {
    // Browser fallback below.
  }
  window.close()
}
