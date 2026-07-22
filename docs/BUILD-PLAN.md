# Build Plan: Roles, Multi-tenancy, and the Mini App

Implements [docs/specs/roles-and-admin-panel.md](specs/roles-and-admin-panel.md). Terms per [CONTEXT.md](../CONTEXT.md), decisions per [docs/adr/](adr/).

Chunks are grouped into waves. Chunks within a wave can run in parallel (separate sessions/worktrees); a wave starts only after the previous wave's blocking chunks are **merged to main**. Each chunk should land as its own PR/branch.

## Wave 1 — independent, start anytime

### A. Security hardening & receipt image storage
Scope (backend only, no schema changes):
- Verify Telegram webhook `X-Telegram-Bot-Api-Secret-Token` header; set `secret_token` in the webhook setup script (`src/scripts/setup-telegram-webhook.ts`).
- Per-user throttle on the bot photo path before enqueueing (Redis counter; generous limit, e.g. 30 photos/min).
- New storage service (S3-compatible; MinIO via docker-compose for dev, env-configured endpoint/bucket/keys).
- Worker downloads the Telegram file once, uploads to object storage, and persists the **object key** in the existing `imageUrl` column (column rename to `imageKey` happens in chunk B — coordinate, don't both migrate).
- One-off script to scrub existing rows whose `imageUrl` contains the bot token.
Done when: no Telegram URLs (with token) are ever written; images exist in the bucket; forged webhook calls are rejected.

### B. Identity & tenancy foundation (the keystone)
Scope (backend schema + services, no bot/HTTP wiring):
- New `users` entity/table: `telegramUserId` (unique), `displayName`, `businessId` (nullable), `role` (`waiter|manager|owner`), `removedAt` soft delete.
- New `invites` entity/table: `inviteeTelegramId`, `businessId`, `role`, `createdBy`, `status` (`pending|redeemed|revoked|expired`), expiry.
- `businesses`: add `status` (`pending|active|rejected|suspended`), `ownerUserId`; **drop unique constraint on `name`**.
- `transactions`: add `businessId` (indexed), `userId`, `status` (`recorded|needs_review`), `editedByUploader`; make extracted fields nullable; rename `imageUrl` → `imageKey`.
- Drop `managers` table/entity (ADR-0001).
- Platform Owner bootstrap from `PLATFORM_OWNER_TELEGRAM_ID` env.
- Services: `UsersService` (lookup by telegramUserId, membership/role checks, promote/demote/remove with owner/last-manager rules), `InvitesService` (create/redeem/revoke/expire).
- Migrations tested against a non-empty database.
Done when: services have unit tests for the role rules; migrations run clean up and down.

### C. Mini App scaffold (mock-driven)
Scope (new `birr-track-miniapp/` package, no backend dependency):
- React + Vite + TypeScript, `@telegram-apps/sdk`, TanStack Query, router.
- API client layer behind an interface, backed by mock fixtures (or MSW) matching the spec's endpoints.
- App shell: role-aware navigation (waiter / manager / owner / platform owner), Telegram theme integration.
- Waiter views fully built against mocks: my Transactions (needs-review first), edit screen with Receipt image, edited flag.
Done when: app runs locally with mocked data for all four roles.

## Wave 2 — needs B merged

### D. Bot flows
- Identity middleware: resolve sender → user/business on every update; gate photo handling; unknown-sender message (register or get invited).
- `/register` handoff to the Mini App Registration flow; Platform Owner DM with Approve/Reject inline buttons (idempotent with Mini App actions).
- Invite flow: role choice, `KeyboardButtonRequestUsers` picker, automatic redemption on `/start` (ADR-0003).
- Media-group-aware acks ("Received 5 receipts ✓"); needs-review ping; suspended-business refusal.
- Mini App entry: `setChatMenuButton` + `web_app` keyboard buttons.

### E. Auth & scoped API
- Public signed Registration endpoints: `POST /registrations/preflight` and `POST /registrations/self`; idempotent per Telegram account, with pending-Invite precedence and rejected-Registration resubmission.
- `POST /auth/telegram`: validate Mini App `initData` HMAC, mint short-lived JWT (`userId`, `businessId`, `role`).
- Global JWT guard + roles guard; **all existing `/transactions` endpoints become authenticated and business-scoped** (waiters see own only).
- `EditLog.editedBy` from the authenticated user (drop `x-editor` header).
- New endpoints: registrations (list/approve/reject), staff (list/promote/demote/remove), invites (list/revoke), image access (signed URL or authenticated proxy), summary extensions (per-waiter, per-bank, attention counters).

### F. Pipeline rework
- Always create a Transaction (carry `businessId`/`userId` through the job payload): complete → `recorded`, else `needs_review` with partial fields.
- Duplicate check scoped by `businessId`.
- Idempotency: dedupe by Telegram `file_unique_id` (+ `update_id`) so webhook redelivery can't double-create.
- VLM-down behavior: retries with backoff, then land as `needs_review` (never lose an acked Receipt).

## Wave 3 — needs C + D + E merged

### G. Mini App real integration & remaining views
- Swap mock API client for the real one (`/registrations/preflight`, `/registrations/self`, then `/auth/telegram` for active users) end-to-end inside Telegram. Verify English/Amharic copy, Telegram theme handling, signed/expired initData errors, and network retry behavior.
- Pre-registration entry states: unregistered overview with Register/Join choices, inline Business-name form, invited bot handoff, pending confirmation, rejected revision/resubmission, and active routing into the normal Mini App.
- Manager/Owner views: summary cards (period totals, per-waiter, per-bank, attention counters → pre-filtered table), full Transactions table with filters + image + edit, Excel export, staff page (Owner: manager management).
- Platform Owner views: pending registrations (approve/reject), business list with suspend.

## After Wave 3
Run [docs/RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md): HTTPS/VPS deploy, backups, monitoring, queue dashboard, timezone (EAT) pass, Amharic bot copy, pilot business.

## Coordination rules
- One chunk = one branch = one PR; merge order within a wave doesn't matter except A and B both touch `transactions` (A writes to the existing column; B renames it — merge A first or rebase B).
- The spec is the contract between D/E (backend) and C/G (frontend): if an endpoint shape must change, update the spec in the same PR.
