# Runbook: Business Registration

**Owner:** Abenezer Ayalneh | **Frequency:** As needed (every new tenant)
**Last Updated:** 2026-06-15 | **Last Run:** —

## Purpose

How a new tenant (Business) is onboarded onto Birr Track end-to-end. Registration is **self-serve with manual approval**: a business owner registers through the Telegram bot, and the **Platform Owner** (the bot/operator) approves or rejects it. This runbook covers both sides plus verification, troubleshooting, and rollback.

Design reference: [docs/specs/roles-and-admin-panel.md §3.1](specs/roles-and-admin-panel.md). Identity model: [ADR-0001](adr/0001-telegram-is-the-only-identity-provider.md), [ADR-0002](adr/0002-single-shared-bot-multi-tenant.md).

### Flow at a glance

```
Business owner                         Platform owner (bot operator)
--------------                         -----------------------------
/start  ──► not registered
/register
  └─ "What is your business name?"
  └─ replies with name
        │  Business created (status=pending), sender stored as prospective owner
        ▼
  "submitted for approval"   ───DM───►  "New business registration: …"
                                         [ ✅ Approve ]  [ ❌ Reject ]
                                         (or Mini App ► Platform ► Registrations)
        ┌──────────────────────────────────────┘
        ▼
  "🎉 approved!" / "not approved"
  (on approve: role ► owner, business ► active)
```

Business lifecycle: `pending → active | rejected`, plus `suspended` (Platform Owner action on an active business). The bot DM buttons and the Mini App act on the **same state, idempotently** — either surface works.

---

## Prerequisites

- [ ] Backend, bot webhook, and DB are up and healthy (see [RUNBOOK-DEPLOY.md](RUNBOOK-DEPLOY.md)).
- [ ] **`PLATFORM_OWNER_TELEGRAM_ID`** is set in the backend env to the Platform Owner's **numeric** Telegram user ID (not @username). Set in `.env` (dev) / `.env.production` (prod) — see [.env.example](../.env.example) line 11. Without it, no approval DM is sent and nobody can approve.
- [ ] The Platform Owner has **sent `/start` to the bot at least once**. Telegram cannot DM a user who has never opened a chat with the bot — the approval notification will silently fail otherwise.
- [ ] The registering owner has a Telegram account that does **not already belong to a Business** (one account = one Business — [ADR-0002](adr/0002-single-shared-bot-multi-tenant.md)).
- [ ] The registering owner has **no pending invite** for their Telegram ID. If one exists, `/start` auto-redeems it and they join as staff instead of registering (see Troubleshooting).

> **Finding a numeric Telegram ID:** message `@userinfobot` on Telegram, or check the backend log line `Resolved user <id>: … isPlatformOwner=<true|false>` emitted by `IdentityService` on each update.

---

## Procedure — Part A: Business Owner side

#### A1: Open the bot and start

```
Send: /start
```
**Expected result:** If not yet registered and with no pending invite, the bot replies:
> You're not registered yet. Send /register to create a business, or ask your manager for an invite.

...with a reply keyboard offering **`/register`** and **"Ask your manager for an invite"**.

**If it fails:**
- Bot says *"Welcome back to …"* → this account is already a member of a Business. Registration is not needed; use a different account to register a new Business.
- Bot says *"You've been added to … as a …"* → a pending invite was auto-redeemed; this account is now staff, not an owner. See Troubleshooting.

#### A2: Start registration

```
Send: /register
```
**Expected result:** Bot replies:
> What is your business name?

**If it fails:** Bot replies *"You are already registered with …"* → the account already belongs to a Business (one-account-one-business). Stop; use another account.

#### A3: Provide the business name

```
Send: <your business name>   e.g. "Tomoca Coffee Bole"
```
**Expected result:** Business is created with status `pending`, the sender is stored as the prospective Owner (role `owner`, not yet active), and the bot replies:
> Thank you! Your business registration has been submitted for approval. We'll notify you when it's ready.

The Platform Owner is then notified automatically (Part B).

**If it fails:** Empty / whitespace-only name → *"Business name cannot be empty. Please try again."* Re-send `/register` and provide a non-empty name. (Names are display labels only — duplicates are allowed.)

#### A4: Wait for the decision

**Expected result:** The owner receives one of these DMs once the Platform Owner acts:
- **Approved:** `🎉 Your business "<name>" has been approved! You can now start accepting receipts from your team.`
- **Rejected:** `Your business registration for "<name>" was not approved at this time. Please contact support for details.`

---

## Procedure — Part B: Platform Owner (bot operator) side

Pick **either** B-path. Both hit the same backend state and are idempotent.

### Path B1 — Approve/Reject from the bot DM (fastest)

#### B1.1: Open the registration notification

**Expected result:** When a business registers, the Platform Owner gets a bot DM:
> New business registration:
>
> Business: \<name\>
> Registrant: \<First Last\> (@username *or* Telegram ID: \<id\>)
>
> Approve or reject below.

...with inline buttons **`✅ Approve`** and **`❌ Reject`** (callback data `approve_biz_<businessId>` / `reject_biz_<businessId>`).

**If it fails (no DM arrives):** see Troubleshooting → "Platform Owner never gets the DM". Fall back to Path B2 (Mini App), which reads the live pending queue regardless of whether the DM was delivered.

#### B1.2: Tap a decision

```
Tap: ✅ Approve   (or ❌ Reject)
```
**Expected result:**
- **Approve:** business → `active`; the registrant is promoted to `owner`; they get the approval DM; the message updates to `✅ Approved: <name>`; toast *"Business approved!"*.
- **Reject:** business → `rejected`; the registrant gets the rejection DM; the message updates to `❌ Rejected: <name>`; toast *"Business rejected."*.

**If it fails:**
- *"Only the Platform Owner can approve/reject registrations."* → the tapping account's Telegram ID ≠ `PLATFORM_OWNER_TELEGRAM_ID`. Verify the env var.
- *"Already approved."* / *"Already rejected."* → idempotent no-op; the decision was already made. Nothing to do.
- *"Cannot approve/reject this business."* → the business is in a terminal/blocking state (e.g. trying to reject an `active` one, or approve a `rejected`/`suspended` one). See Rollback.
- *"Business not found."* → the business was deleted, or the button is stale. Use Path B2.

### Path B2 — Approve/Reject from the Mini App

#### B2.1: Open the Platform section

```
Bot menu ► Open App ► bottom nav ► "Platform" (✅)
```
**Expected result:** The **Platform** page loads (visible only to `platform_owner` role) with two tabs: **Registrations** and **Businesses**. The Registrations tab shows the pending queue — each row lists the business name, registrant display name, @username, Telegram ID, and request date.

**If it fails:** No "Platform" nav item, or 403 / *"Only platform owner can access registrations"* → you are not signed in as the Platform Owner. The role is derived server-side from `PLATFORM_OWNER_TELEGRAM_ID` during `POST /auth/telegram`; confirm the Mini App was opened from the Platform Owner's Telegram account.

#### B2.2: Approve or reject from the queue

```
Tap: Approve   (or Reject) on the row
```
**Expected result:** The row disappears from the pending queue; on approve the business moves to the **Businesses** tab with status `active`. Backend calls:
- `GET  /registrations` — list pending (platform_owner only)
- `POST /registrations/<businessId>/approve`
- `POST /registrations/<businessId>/reject`

**If it fails:** An inline error banner appears. Retry; if it persists, check backend logs and fall back to Path B1 or the manual DB path (Rollback).

---

## Verification

After approval, confirm onboarding succeeded:

- [ ] **Owner side:** registrant received the `🎉 … approved!` DM (i.e. it greets them with *"Welcome back to \<name\>"* on `/start`).
- [ ] **Platform side:** the business no longer appears in the **Registrations** queue and shows as `active` in the **Businesses** tab (or `GET /registrations` no longer returns it).
- [ ] **DB check (optional, authoritative):**

  ```bash
  # prod
  docker compose -f docker-compose.prod.yml exec postgres \
    psql -U "${DATABASE_USER:-postgres}" -d "${DATABASE_NAME:-birr_track}" \
    -c "SELECT b.id, b.name, b.status, u.display_name, u.role
        FROM businesses b LEFT JOIN users u ON u.id = b.owner_user_id
        ORDER BY b.created_at DESC LIMIT 5;"
  ```
  Expect the new row with `status = active` and the owner's `role = owner`. (Dev: drop `-f docker-compose.prod.yml` and run from `birr-track-backend/`.)

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| Platform Owner never gets the approval DM | `PLATFORM_OWNER_TELEGRAM_ID` unset/wrong, **or** the Platform Owner never sent `/start` to the bot (Telegram can't DM cold) | Set the env var to the correct numeric ID, restart the backend, and have the Platform Owner `/start` the bot once. Meanwhile approve via Mini App (Path B2). |
| Tapping Approve → *"Only the Platform Owner can approve registrations."* | Tapping account's Telegram ID ≠ `PLATFORM_OWNER_TELEGRAM_ID` | Confirm the env var matches that account's **numeric** ID (see "Finding a numeric Telegram ID"). |
| *"Already approved."* / *"Already rejected."* | Idempotent no-op; decision already made (e.g. both surfaces used) | None — already done. |
| *"Cannot approve this business."* | Business is `rejected` or `suspended` (approve is blocked from these states) | See Rollback to move it back to `pending` first. |
| *"Cannot reject this business."* | Business is already `active` | Use **Suspend** instead of reject (Rollback). |
| Owner sends `/register` → *"You are already registered with …"* | That Telegram account already belongs to a Business (one-account-one-business, [ADR-0002](adr/0002-single-shared-bot-multi-tenant.md)) | Register from a different account, or remove the account from its current Business first. |
| `/start` says *"You've been added to … as a …"* instead of offering register | A pending **invite** existed for this Telegram ID and was auto-redeemed | Expected behavior. If they should own a new Business, revoke the invite (Mini App ► Staff) **before** they `/start`, or use a different account. |
| Mini App: no "Platform" tab, or `GET /registrations` 403 | Signed-in user isn't the Platform Owner (JWT role ≠ `platform_owner`) | Open the Mini App from the Platform Owner's Telegram account; verify `PLATFORM_OWNER_TELEGRAM_ID`. |
| Approval DM never reaches the **owner** after approve | Owner blocked the bot, or `ownerUserId`/user record missing | Check backend logs for `Failed to notify registrant`; have the owner `/start` the bot; the status change still applies regardless of DM delivery. |

---

## Rollback

There is **no automatic "un-approve"** — approval is one-way in the normal flow. Use these instead:

- **Approved by mistake → Suspend.** Mini App ► Platform ► **Businesses** tab ► **Suspend**. A suspended Business: the bot refuses receipts and the Mini App is read-only. Reverse with **Unsuspend** (returns it to `active`).
- **Rejected by mistake → must reopen, then re-approve.** Approving a `rejected` business is blocked (`ConflictException`), so set it back to `pending` in the DB first, then approve via Path B1/B2:

  ```bash
  docker compose -f docker-compose.prod.yml exec postgres \
    psql -U "${DATABASE_USER:-postgres}" -d "${DATABASE_NAME:-birr_track}" \
    -c "UPDATE businesses SET status='pending' WHERE id='<businessId>';"
  ```
- **Fully undo an onboarding (last resort, manual DB).** Set the business back and demote/detach the owner. Do this only with a DB backup taken first:

  ```sql
  -- inside psql; verify the IDs first
  UPDATE businesses SET status='rejected' WHERE id='<businessId>';
  -- optionally detach the prospective owner from the tenant
  -- (review users.role / users.business_id before changing — keeps Transactions attributable)
  ```

> Prefer the Suspend path over raw DB edits whenever possible; direct `businesses`/`users` mutation can leave the Mini App role and bot state inconsistent until the next `/auth/telegram` round-trip.

---

## Escalation

| Situation | Contact | Method |
|---|---|---|
| Approval DMs not sending despite correct env + `/start` | Backend on-call | Check backend logs (`Failed to notify Platform Owner`) + Telegram webhook health ([RUNBOOK-DEPLOY.md](RUNBOOK-DEPLOY.md)) |
| Business stuck in a state no surface can change | Platform Owner / DB admin | Manual DB fix per Rollback, with a backup first |
| Suspected brand impersonation in the queue | Platform Owner | Reject; cross-check registrant Telegram profile (name/@username/ID shown in the queue) |

---

## History

| Date | Run By | Notes |
|------|--------|-------|
| 2026-06-15 | — | Runbook created. |
