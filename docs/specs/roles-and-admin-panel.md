# Spec: Roles, Multi-tenancy, and the Admin Panel

Status: agreed 2026-06-11 (grilling session). Terms used here are defined in [CONTEXT.md](../../CONTEXT.md); key decisions are recorded in [docs/adr/](../adr/).

## 1. Goal

Turn the single-pipeline receipt bot into a multi-tenant product: Businesses register self-serve (Platform Owner approves), staff join by ID-bound Invites, Waiters submit Receipts in bulk through the shared bot, and everyone opens a role-aware Telegram Mini App — Waiters to fix their own Transactions, Managers/Owners to see reports and manage staff, the Platform Owner to approve Businesses.

## 2. Roles & permissions

| Capability | Waiter | Manager | Owner | Platform Owner |
|---|---|---|---|---|
| Submit Receipts via bot | ✅ | ✅ | ✅ | — |
| Mini App: view/edit **own** Transactions | ✅ | ✅ | ✅ | — |
| Mini App: view **all** Business Transactions, reports, export | — | ✅ | ✅ | — |
| Edit any Transaction of the Business | — | ✅ | ✅ | — |
| Invite/remove Waiters | — | ✅ | ✅ | — |
| Invite/remove/demote Managers | — | — | ✅ | — |
| Register a Business (becomes its Owner) | any Telegram user | — |
| Approve/reject Business registrations | — | — | — | ✅ |
| Suspend a Business | — | — | — | ✅ |

Rules:
- Role hierarchy: Owner ⊃ Manager ⊃ Waiter. Exactly one Owner per Business (transfer is out of scope for v1).
- A Telegram account belongs to at most one Business (ADR-0002).
- All edits to Transactions are written to the existing `EditLog`; Transactions edited by a Waiter are visibly flagged in the Manager view.

## 3. Flows

### 3.1 Business registration
1. Unregistered user sends `/register` (or any message → bot offers Register / "ask your manager for an invite").
2. Bot collects business name (validate: non-empty only). Names are display labels, not identifiers — duplicates are allowed; nothing in the system looks a Business up by name. The approval queue shows the registrant's Telegram profile (name, @username, ID) alongside the business name so the Platform Owner can tell same-named businesses apart and spot brand impersonation.
3. Business created with status `pending`; sender stored as prospective Owner.
4. Platform Owner gets a bot DM with details + inline **Approve / Reject** buttons; the same queue appears in the Mini App's platform-owner section (system of record — both surfaces act on the same state, idempotently).
5. On approve: Business → `active`, registrant becomes Owner, bot notifies them. On reject: bot notifies with reason (free text optional).

Business lifecycle: `pending → active | rejected`, plus `suspended` (Platform Owner action; bot refuses receipts, Mini App read-only).

### 3.2 Invites (ADR-0003)
1. Manager/Owner starts the invite flow in bot DM (`/invite`, also deep-linked from the Mini App staff page).
2. Bot asks role — Waiter for Managers; Waiter or Manager for Owners — then shows a `KeyboardButtonRequestUsers` picker.
3. Bot stores an Invite: `{ inviteeTelegramId, businessId, role, createdBy, status: pending }`. One pending Invite per Telegram ID (it's the same one-account-one-business rule).
4. When the invitee starts the bot, the pending Invite is matched by ID and redeemed automatically; both parties get a confirmation message.
5. Pending Invites are listed and revocable in the Mini App staff page. Expiry: 7 days (config).

### 3.3 Receipt submission
- Photos from members of an active Business are accepted; each photo gets a lightweight ack (for media groups/albums: one ack per album, e.g. "Received 5 receipts ✓").
- Photos from unknown senders get the register-or-get-invited message; nothing is processed or stored.
- Worker pipeline per Receipt:
  1. Download image from Telegram **once**, upload to S3-compatible object storage; store the object key (never the Telegram URL — the current `imageUrl` embeds the bot token and expires).
  2. VLM extraction.
  3. Always create a Transaction (carrying `businessId` + `userId`): all fields present → `recorded`; anything missing → `needs_review` with whatever was readable, **and** the bot pings the waiter ("⚠️ 1 receipt needs your attention — open the app to fix it").
  4. Duplicate check scoped to the Business (transactionId + amount + timestamp); duplicates are saved and flagged, never dropped.

### 3.4 Waiter edits
- In the Mini App, a Waiter sees their own Transactions (filter: needs-review first), the Receipt image alongside, and can edit amount, bank, transaction ID, timestamp.
- Saving an edit writes an `EditLog` entry and sets an `edited` flag surfaced in the Manager view, so managers know to verify against the image.
- Completing all fields of a `needs_review` Transaction transitions it to `recorded`.

## 4. Admin Panel (Mini App)

New monorepo package `birr-track-miniapp/`: React + Vite + TypeScript, `@telegram-apps/sdk` (initData, theme, back button), TanStack Query.

Views by role (role comes from the backend after initData validation — never from the client):
- **Waiter**: my Transactions (status filter), edit screen with image.
- **Manager/Owner adds**: summary cards — period totals (today/week/month + custom range), per-waiter breakdown, per-bank breakdown, attention counters (needs-review / duplicates / edited, each opening the pre-filtered table); full Transactions table (filter by waiter, bank, status, date; view image; edit); Excel export (existing endpoint, now business-scoped); staff page (list members + roles, revoke pending Invites, remove Waiter; Owner also promotes/demotes/removes Managers).
- **Platform Owner adds**: pending registrations queue (approve/reject), Business list with suspend.

## 5. Backend changes

### Data model
- **`users`** (new): `id`, `telegramUserId` (unique), `displayName`, `businessId` (nullable for Platform Owner), `role` (`waiter | manager | owner`), `isPlatformOwner` or env-based bootstrap, `createdAt`, `removedAt` (soft delete — keeps Transactions attributable after removal).
- **`businesses`**: add `status` (`pending | active | rejected | suspended`), `ownerUserId`; **drop the unique constraint on `name`** (names are labels, duplicates allowed).
- **`managers`**: **dropped** (replaced by `users`; email/password are obsolete per ADR-0001).
- **`invites`** (new): as in 3.2, with `status: pending | redeemed | revoked | expired`.
- **`transactions`**: add `businessId` (indexed), `userId` (FK to users), `status` (`recorded | needs_review`), `editedByUploader` flag; extracted fields become nullable (needs_review); replace `imageUrl` with `imageKey`; keep `telegramUserId`/`telegramName` as denormalized capture data.

### Auth & API
- `POST /auth/telegram`: validate Mini App `initData` HMAC (bot token), look up the user, mint a short-lived JWT carrying `userId`, `businessId`, `role`.
- Global JWT guard + role guard; **every existing transactions endpoint becomes authenticated and business-scoped** (today they are wide open — this is a release blocker).
- `x-editor` header replaced by the authenticated user identity in `EditLog`.
- New endpoints: registration approval, staff/invite management, image serving (signed URL or authenticated proxy from object storage).
- Platform Owner bootstrap: `PLATFORM_OWNER_TELEGRAM_ID` env var.

### Bot
- Identity middleware resolving sender → user/business on every update; gates photo handling.
- `/register` conversation, invite flow with user picker, approve/reject inline buttons, media-group-aware acks, needs-review pings.
- Mini App entry: persistent menu button (`setChatMenuButton`) + keyboard `web_app` buttons.

## 6. Out of scope for v1 (explicitly deferred)
- Ownership transfer; multi-business membership per account.
- Desktop/browser access to the Admin Panel (magic links — see ADR-0001).
- In-chat correction buttons; OCR retraining loop from waiter corrections (collect the data via EditLog now, use it later).
- Self-serve business approval (stays manual via Platform Owner).
