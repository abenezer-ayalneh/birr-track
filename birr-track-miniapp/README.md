# Birr Track Mini App

Telegram Mini App frontend for the Birr Track receipt-tracking platform.

## Quick start

### Install dependencies

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

Opens on `http://localhost:5173`. The app runs in dev mode with:

- **Role switching**: Open the app and append `?role=waiter|manager|owner|platform_owner` to switch roles. Example: `http://localhost:5173?role=manager`
- **Mock API**: All endpoints are backed by realistic Ethiopian fixture data (see `src/api/mock/fixtures.ts`).
- **Dev fallback**: If not running inside Telegram, the app starts in a browser with fake Telegram `initData`.

### Build

```bash
pnpm build
```

Outputs to `dist/`.

### Lint

```bash
pnpm lint
```

## Architecture

### Stack

- **React 19** + **Vite** for the UI.
- **@telegram-apps/sdk** for Mini App integration (theming, back button, user data).
- **TanStack Query (React Query)** for state management and caching.
- **Wouter** for lightweight client-side routing.
- **TypeScript** for type safety.

### API Layer

All backend integration is behind the `ApiClient` interface (`src/api/client.ts`):

- **Chunk C (now)**: Backed by `MockApiClient` with fixtures (`src/api/mock/`).
- **Chunk G (later)**: Swapped for real HTTP client after backend chunk E (`POST /auth/telegram` + JWT).

The mock client is fully feature-complete: optimistic updates, filtering, pagination.

### File structure

```
src/
  api/
    types.ts          # Domain types (Transaction, Role, etc.)
    client.ts         # ApiClient interface
    mock/
      client.ts       # MockApiClient implementation
      fixtures.ts     # Realistic Ethiopian data
      receiptSvg.ts   # SVG receipt generator
  components/         # Reusable UI components
    Layout.tsx
    Navigation.tsx
  lib/
    telegram.ts       # Telegram SDK + dev fallback
    useApi.ts         # Hook for API access
    useRole.ts        # Hook for user role/profile
  pages/              # Route pages
    WaiterTransactions.tsx   # ✅ FULLY BUILT (Chunk C)
    WaiterEdit.tsx           # ✅ FULLY BUILT (Chunk C)
    Dashboard.tsx            # 📋 Stub (built in Chunk G)
    Staff.tsx                # 📋 Stub (built in Chunk G)
    Registrations.tsx        # 📋 Stub (built in Chunk G)
  styles/
    globals.css
    layout.css
    waiter.css
  App.tsx             # Router & providers
  main.tsx
```

## Completed in Chunk C

### ✅ Waiter views (fully functional)

- **My Receipts** (`/transactions`): List waiter's own transactions with needs-review surfaced first, status chips for duplicate/edited.
- **Edit screen** (`/transactions/:id`): Receipt image + editable fields (amount, bank, transaction ID, timestamp), save via mock with optimistic update.

### ✅ Mock API

- Full `ApiClient` interface implementation.
- Realistic data: Ethiopian banks (CBE, Telebirr, Awash, Dashen), ETB amounts, staff names.
- Optimistic updates on transaction edit.

### ✅ App shell

- Role-aware navigation (waiter / manager / owner / platform owner).
- Telegram theme variable integration (light/dark).
- Mobile-first, responsive layout.

### ✅ Role switching (dev-only)

In development, switch roles via `?role=X` query param or `VITE_DEV_ROLE` env var. Both modes (Telegram + browser) supported.

## Running locally

### Prerequisites

- Node.js 18+
- pnpm 8+

### Start

```bash
cd birr-track-miniapp
pnpm install
pnpm dev
```

Then visit `http://localhost:5173` (or `http://localhost:5173?role=manager` to test as a manager).

## Testing the waiter flow

1. Open the app in dev mode.
2. Click a "Needs Review" receipt to open the edit screen.
3. Fill in the missing fields (bank, amount, transaction ID, timestamp).
4. Click "Save" — the transaction will save optimistically and redirect to the list.
5. Switch roles to `manager` via query param to see all staff transactions.

## Next steps (Chunk G)

- Swap `MockApiClient` for real HTTP client (chunk E backend required).
- Build full Manager/Owner dashboard with reports.
- Build Platform Owner registration queue.
- Add Excel export endpoint integration.

## Environment variables

- `VITE_DEV_ROLE`: Default role for dev fallback (default: `waiter`). Override via `?role=X` query param.

## Notes

- The `imageUrl` in transactions is a data URI (SVG receipt mock) in chunk C. Chunk G will use signed S3 URLs.
- All edits are written to the mock client's in-memory state. Chunk G will POST to `/transactions/:id`.
- The back button and theme are integrated via `@telegram-apps/sdk`, but the dev fallback still works in a regular browser.
