/**
 * Telegram Mini App SDK initialization with dev fallback.
 * In development, the app runs in a plain browser with a fake initData.
 * In production, it runs inside Telegram and uses real initData.
 */

import type { Role } from '../api/types'

let _cachedInitData: string = ''
let _isInTelegram = false

/**
 * Dev fallback initData. The role comes from VITE_DEV_ROLE env var or
 * the role= query param (both override each other in order: query param wins).
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
  // Try to detect if we're in Telegram by checking for the Telegram object.
  _isInTelegram = typeof (window as { Telegram?: unknown }).Telegram !== 'undefined'

  if (_isInTelegram) {
    // Would initialize the real SDK here, but for chunk C we always use dev fallback.
    // Future: import { initData, retrieveLaunchParams } from '@telegram-apps/sdk'
  }

  // Dev fallback: detect role from env or query param.
  const urlParams = new URLSearchParams(window.location.search)
  const queryRole = urlParams.get('role') as Role | null
  const envRole = (import.meta.env.VITE_DEV_ROLE || 'waiter') as Role

  const role = queryRole || envRole

  _cachedInitData = devInitData(role)

  console.log(
    `[Dev] Running with role="${role}". Switch via ?role=manager|owner|platform_owner or VITE_DEV_ROLE env.`,
  )
}

/**
 * Get the validated initData string. Returns empty string if neither Telegram
 * nor dev fallback is available (should not happen in normal flow).
 */
export function getInitData(): string {
  return _cachedInitData
}

/**
 * Check if we're running in the Telegram Mini App environment.
 */
export function isInTelegram(): boolean {
  return _isInTelegram
}
