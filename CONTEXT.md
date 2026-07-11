# Birr Track

Ethiopian receipt-tracking platform: staff submit payment receipts through a Telegram bot, a VLM extracts the transaction details, and managers review reports in a Telegram Mini App.

## Language

### People & Roles

**Language Preference**:
A person's selected interface language for Birr Track bot and Admin Panel text. Supported values are English and Amharic. Registered users keep this preference on their Birr Track profile; unregistered people may be asked again if their chat session is lost before they register or redeem an Invite.
_Avoid_: locale, translation setting

**Waiter**:
A staff member of a Business who submits Receipts through the Telegram bot. Identified by their Telegram account.
_Avoid_: staff, employee, uploader

**Manager**:
A Waiter with additional rights: reviews reports in the Admin Panel and manages the Waiters of their Business. Everything a Waiter can do, a Manager can do. Cannot manage other Managers.
_Avoid_: admin

**Owner**:
The Manager who registered the Business. The only role that can add, remove, or demote Managers. Everything a Manager can do, the Owner can do. Exactly one per Business.
_Avoid_: business admin, founder

**Platform Owner**:
The operator of Birr Track itself (not of any Business). Approves Business registrations and oversees the platform.
_Avoid_: super-admin, root

### Tenancy

**Business**:
A tenant (e.g., a restaurant) with its own Waiters, Managers, and Transactions. Created by self-serve registration, activated only after Platform Owner approval (lifecycle: pending → active / rejected). A Telegram account belongs to at most one Business. Its name is a display label, not an identifier — duplicate names are allowed.
_Avoid_: tenant, organization, restaurant

**Invite**:
A Manager's grant letting one specific Telegram account join their Business in a chosen role (Waiter or Manager). Bound to the invitee's Telegram ID at creation via Telegram's native user picker; redeemed automatically when that person starts the bot.
_Avoid_: invite code, join link

### Receipts & Money

**Receipt**:
An image of a payment proof submitted by a Waiter: a screenshot of a mobile payment app receipt, a payment confirmation message, a payment document, or a photo of such a screenshot taken from another phone.
_Avoid_: screenshot, image, slip

**Transaction**:
The structured record extracted from a Receipt (bank, amount, transaction ID, timestamp, confidence), stored against the submitting Waiter and their Business. Every Receipt produces a Transaction, even when extraction fails.
_Avoid_: payment, record

**Needs Review**:
A Transaction whose extraction was incomplete or failed; a Waiter or Manager must fill in the missing fields from the Receipt image before it counts as Recorded.
_Avoid_: failed, pending, draft

**Recorded**:
A Transaction with all fields present. The default state after a successful extraction.
_Avoid_: complete, verified

**Duplicate**:
A Transaction whose bank transaction ID, amount, and timestamp match an earlier Transaction **of the same Business**. Saved and flagged, never silently dropped.
_Avoid_: copy, resubmission

### Surfaces

**Admin Panel**:
The Telegram Mini App where Managers view Transactions, summaries, and manage staff; the Platform Owner additionally approves Business registrations there.
_Avoid_: dashboard, admin site, web app

**Admin Panel Session**:
Server-managed authenticated state for an open Admin Panel. Created only after Telegram `initData` validation, renewable while the Admin Panel remains visible, and bounded by idle and absolute expiry.
_Avoid_: login session, browser session, Telegram session

### Infrastructure

**VLM Worker**:
The RunPod serverless endpoint that runs the fine-tuned Qwen2.5-VL-3B-Instruct + LoRA adapter for Receipt extraction. Accepts base64-encoded image in JSON, returns structured Transaction fields. Called by the backend via RunPod's `/runsync` API. Model weights live on a RunPod Network Volume (not baked into the Docker image).
_Avoid_: VLM service, inference server, model API
