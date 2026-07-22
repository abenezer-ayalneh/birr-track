# Runbook: Business Registration

**Owner:** Abenezer Ayalneh | **Frequency:** As needed (every new tenant)
**Last Updated:** 2026-07-19 | **Last Run:** —

## Purpose

How a new Business is onboarded onto Birr Track end-to-end. Registration is **self-serve with manual approval**: a Prospective Owner enters through the Telegram bot, submits the Registration in the signed Telegram Mini App, and the Platform Owner approves or rejects it. This runbook covers both sides plus verification, troubleshooting, and rollback.

Design reference: [docs/specs/roles-and-admin-panel.md §3.1](specs/roles-and-admin-panel.md). Identity model: [ADR-0001](adr/0001-telegram-is-the-only-identity-provider.md), [ADR-0002](adr/0002-single-shared-bot-multi-tenant.md).

### Flow at a glance

```
Prospective Owner                         Platform Owner (bot operator)
-----------------                         -----------------------------
/start or /register
  └─ [ Register a Business ]
        │
        ▼
  Mini App validates Telegram identity
  └─ enter Business name
  └─ submit Registration
        │  Business created (status=pending)
        │  sender stored as Prospective Owner
        ├──────────────────────────────DM────►  New Registration card
        │                                      [ Approve ] [ Reject ]
        │                                      (or Mini App ► Platform ► Registrations)
        ▼
  Pending Registration view
        │
        ├─ approved ─► DM + [ Open Mini App ] ─► Owner, Business active
        └─ rejected ─► DM + [ Revise Registration ] ─► edit and resubmit
```

Business lifecycle: `pending → active | rejected`, plus `suspended` (Platform Owner action on an active Business). The bot DM buttons and the Mini App act on the **same state, idempotently** — either surface works.

---

## Prerequisites

- [ ] Backend, bot webhook, and DB are up and healthy (see [RUNBOOK-DEPLOY.md](RUNBOOK-DEPLOY.md)).
- [ ] **`PLATFORM_OWNER_TELEGRAM_ID`** is set in the backend env to the Platform Owner's **numeric** Telegram user ID (not @username). Set it in `.env` (dev) / `.env.production` (prod). Without it, no Registration alert is sent and nobody can approve.
- [ ] **`FRONTEND_APP_URL`** points to the deployed HTTPS Mini App.
- [ ] **`TELEGRAM_SUPPORT_URL`** is a valid HTTPS support destination, such as `https://t.me/birr_track_support`. The backend refuses to start when it is missing or invalid.
- [ ] **`VITE_BOT_USERNAME`** contains the bot username without `@`, so the Mini App can send invited people back to the bot.
- [ ] The Platform Owner has **sent `/start` to the bot at least once**. Telegram cannot DM a user who has never opened a chat with the bot — the approval notification will silently fail otherwise.
- [ ] The Prospective Owner has a Telegram account that does **not already belong to a Business** (one account = one Business — [ADR-0002](adr/0002-single-shared-bot-multi-tenant.md)).
- [ ] The Prospective Owner has **no pending Invite** for their Telegram ID. If one exists, `/start` auto-redeems it and creates the granted Business Membership instead of a Registration (see Troubleshooting).

> **Finding a numeric Telegram ID:** message `@userinfobot` on Telegram, or check the backend log line `Resolved user <id>: … isPlatformOwner=<true|false>` emitted by `IdentityService` on each update.

---

## Procedure — Part A: Prospective Owner side

#### A1: Open the bot and start

```
Send: /start
```
**Expected result:** If the Telegram account has no Business Membership and no pending Invite, the bot shows a concise Registration card with a **Register a Business** Mini App action. The card explains that someone joining an existing Business should ask a Manager or Owner for an Invite; there is no separate “ask manager” keyboard button.

**If it fails:**
- The bot shows the active Business menu → this account is already a member of a Business. Registration is not needed; use a different account to register a new Business.
- The bot confirms an Invite was redeemed → this account now has a Business Membership, not a Registration. See Troubleshooting.
- The bot shows **View Registration** or **Revise Registration** → this account already has a pending or rejected Registration; continue from that state instead of creating another Business.

#### A2: Open Registration in the Mini App

```
Send: /register
```
**Expected result:** For an unregistered, pending, or rejected account, `/register` shows the corresponding Registration card and Mini App action. Tap it. The Mini App validates Telegram `initData` and presents the state for that Telegram account without a separate password:

- `unregistered` → Registration form is available.
- `invited` → return to the bot to redeem the Invite.
- `pending` → view the submitted Registration.
- `rejected` → view the rejection reason and revise the Registration.
- `active` → use `/start` and **Open Mini App** for the existing Business Membership; no second Registration is created.

The bot does not collect a Business name in chat.

**If it fails:** If Telegram opens the Mini App without signed `initData`, close it and reopen it from the bot. If the action opens the wrong URL, verify `FRONTEND_APP_URL`.

#### A3: Submit the Business name

```
Mini App ► Register a Business
Business name: Tomoca Coffee Bole
Tap: Submit for approval
```
**Expected result:** The Business is created with status `pending`, the Telegram account is stored as its Prospective Owner, and the Mini App switches to the pending Registration view. The Platform Owner is notified automatically (Part B).

**If it fails:** Empty / whitespace-only name stays in the form with a validation message. Enter a non-empty name and resubmit. Business names are display labels, so duplicates are allowed.

#### A4: Wait for the decision

**Expected result:** The Prospective Owner receives exactly one decision DM when the state changes, whether the decision came from the bot alert or Mini App:

- **Approved:** an outcome-first approval card with an **Open Mini App** action. The Business becomes `active` and the Prospective Owner becomes its Owner.
- **Rejected:** a revision card containing the Business name and stored reason (or that no reason was provided), with a **Revise Registration** action. The Mini App pre-fills the existing name; submitting it again moves the same Business back to `pending` and sends a new Platform Owner alert.

---

## Procedure — Part B: Platform Owner (bot operator) side

Pick **either** B-path. Both hit the same backend state and are idempotent.

### Path B1 — Approve/Reject from the bot DM (fastest)

#### B1.1: Open the registration notification

**Expected result:** When a Business is submitted or resubmitted, the Platform Owner gets an English Registration card. It identifies the Business and Prospective Owner once, then offers **Approve** and **Reject** inline actions (callback data `approve_biz_<businessId>` / `reject_biz_<businessId>`).

**If it fails (no alert arrives):** see Troubleshooting → "Platform Owner never gets the Registration alert". Fall back to Path B2 (Mini App), which reads the live pending queue regardless of whether the alert was delivered.

#### B1.2: Tap a decision

```
Tap: Approve   (or Reject)
```
**Expected result:**
- **Approve:** Business → `active`; the Prospective Owner becomes the Owner; they get the localized approval message with **Open Mini App**; the Platform Owner alert is edited into its final approved card.
- **Reject:** Business → `rejected`; the Prospective Owner gets the localized rejection DM with **Revise Registration**; the Platform Owner alert is edited into its final rejected card.

The callback popup is a short plain-text outcome. Repeating a decision is an idempotent no-op and does not send another Prospective Owner DM.

**If it fails:**
- The popup says only the Platform Owner may decide → the tapping account's Telegram ID differs from `PLATFORM_OWNER_TELEGRAM_ID`. Verify the env var.
- The popup says the Registration was already approved/rejected → idempotent no-op; nothing else is required.
- The popup says the Business cannot be approved/rejected → its state blocks that transition. See Rollback.
- The popup says the Business was not found → the alert is stale. Use Path B2.

### Path B2 — Approve/Reject from the Mini App

#### B2.1: Open the Platform section

```
Bot menu ► Open Mini App ► bottom nav ► Platform
```
**Expected result:** The **Platform** page loads (visible only to `platform_owner` role) with **Registrations** and **Businesses** tabs. The Registrations queue shows the Business name, Prospective Owner identity, and request date.

**If it fails:** No "Platform" nav item, or 403 / *"Only platform owner can access registrations"* → you are not signed in as the Platform Owner. The role is derived server-side from `PLATFORM_OWNER_TELEGRAM_ID` during `POST /auth/telegram`; confirm the Mini App was opened from the Platform Owner's Telegram account.

#### B2.2: Approve or reject from the queue

```
Tap: Approve   (or Reject) on the row
```
**Expected result:** The row disappears from the pending queue. Approval moves the Business to `active`; rejection stores the optional reason. The same localized Prospective Owner DM is sent exactly once as for a bot-button decision. Backend calls:
- `GET  /registrations` — list pending (platform_owner only)
- `POST /registrations/<businessId>/approve`
- `POST /registrations/<businessId>/reject`

**If it fails:** An inline error banner appears. Retry; if it persists, check backend logs and fall back to Path B1 or the manual DB path (Rollback).

---

## Verification

After approval, confirm onboarding succeeded:

- [ ] **Owner side:** the Prospective Owner received the approval message, its **Open Mini App** action works, and `/start` now shows the active Business menu.
- [ ] **Bot presentation:** each normal English card has one descriptive emoji, a bold outcome-first title, short labeled facts, and one clear next step; callback popups remain short plain text.
- [ ] **Platform side:** the Business no longer appears in the **Registrations** queue and shows as `active` in the **Businesses** tab (or `GET /registrations` no longer returns it).
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
| Platform Owner never gets the Registration alert | `PLATFORM_OWNER_TELEGRAM_ID` unset/wrong, **or** the Platform Owner never sent `/start` to the bot (Telegram cannot initiate a cold DM) | Set the env var to the correct numeric ID, restart the backend, and have the Platform Owner send `/start` once. Meanwhile approve via Mini App (Path B2). |
| Backend will not start; error names `TELEGRAM_SUPPORT_URL` | Support URL is missing, malformed, or not HTTPS | Set it to a valid HTTPS destination such as `https://t.me/birr_track_support`, then restart the backend. |
| Tapping **Approve** says only the Platform Owner may decide | Tapping account's Telegram ID ≠ `PLATFORM_OWNER_TELEGRAM_ID` | Confirm the env var matches that account's **numeric** ID (see “Finding a numeric Telegram ID”). |
| Decision reports already approved/rejected | Idempotent no-op; another surface already made the decision | None — the original decision remains authoritative and no duplicate DM is sent. |
| Business cannot be approved | Business is `rejected` or `suspended` | A rejected Prospective Owner must revise and resubmit first; unsuspend a suspended Business instead. |
| Business cannot be rejected | Business is already `active` | Use **Suspend** instead of Reject (Rollback). |
| `/register` opens the normal Mini App | That Telegram account already has an active Business Membership | Registration is not needed. Use a different Telegram account for a new Business. |
| `/start` confirms an Invite instead of offering Registration | A pending Invite existed for this Telegram ID and was auto-redeemed | Expected behavior. If they should own a new Business, revoke the Invite (Mini App ► Staff) **before** they send `/start`, or use a different account. |
| Mini App: no "Platform" tab, or `GET /registrations` 403 | Signed-in user isn't the Platform Owner (JWT role ≠ `platform_owner`) | Open the Mini App from the Platform Owner's Telegram account; verify `PLATFORM_OWNER_TELEGRAM_ID`. |
| Decision DM never reaches the Prospective Owner | They blocked the bot, or the Prospective Owner record is missing | Check backend logs for the failed decision notification; have them send `/start`. The state change still applies regardless of DM delivery. |

---

## Rollback

There is **no automatic "un-approve"** — approval is one-way in the normal flow. Use these instead:

- **Approved by mistake → Suspend.** Mini App ► Platform ► **Businesses** tab ► **Suspend**. A suspended Business: the bot refuses receipts and the Mini App is read-only. Reverse with **Unsuspend** (returns it to `active`).
- **Rejected by mistake → revise and resubmit.** Ask the Prospective Owner to use **Revise Registration** in the DM or `/start`, then submit the pre-filled Business name again. The same Business returns to `pending`; approve it through Path B1 or B2.
- **Fully undo an onboarding (last resort, manual DB).** Set the Business back and demote/detach the Owner. Do this only with a DB backup taken first:

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
| Registration alerts not sending despite correct env + `/start` | Backend on-call | Check backend logs (`Failed to notify Platform Owner`) + Telegram webhook health ([RUNBOOK-DEPLOY.md](RUNBOOK-DEPLOY.md)) |
| Business stuck in a state no surface can change | Platform Owner / DB admin | Manual DB fix per Rollback, with a backup first |
| Suspected brand impersonation in the queue | Platform Owner | Reject; cross-check the Prospective Owner's Telegram identity shown in the queue |

---

## History

| Date | Run By | Notes |
|------|--------|-------|
| 2026-07-19 | — | Replaced chat Registration with the signed Mini App flow; documented contextual actions, revision, and support URL. |
| 2026-06-15 | — | Runbook created. |
