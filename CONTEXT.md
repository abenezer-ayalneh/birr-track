# Birr Track

Ethiopian receipt-tracking platform: staff submit payment receipts through a Telegram bot, a VLM extracts the transaction details, and managers review reports in a Telegram Mini App.

## Language

### People & Roles

**Language Preference**:
A person's selected interface language for Birr Track bot and Mini App text. Supported values are English and Amharic. Registered users keep this preference on their Birr Track profile; unregistered people may be asked again if their chat session is lost before they register or redeem an Invite.
_Avoid_: locale, translation setting

**Waiter**:
A member of a Business who submits Receipts through the Telegram bot. Identified by their Telegram account and may leave the Business voluntarily.
_Avoid_: staff, employee, uploader

**Manager**:
A Waiter with additional rights: reviews Transactions in the Mini App and manages the Waiters of their Business. May leave voluntarily; cannot manage other Managers.
_Avoid_: admin

**Owner**:
The Manager who registered the Business. The only role that can add, remove, or demote Managers. Everything a Manager can do, the Owner can do. Exactly one per Business.
_Avoid_: business admin, founder

**Business Membership**:
A Telegram account's active association with exactly one Business and a role. It ends when the member leaves or is removed and may later be reactivated through a new Invite or registration.
_Avoid_: assignment, staff record

**Leave**:
The voluntary end of a Waiter or Manager's Business Membership.
_Avoid_: self-remove, unassign

**Remove**:
The administrative end of another member's Business Membership by an authorized Manager or Owner.
_Avoid_: delete user, fire

**Platform Owner**:
The operator of Birr Track itself (not of any Business). Decides Registrations and oversees the platform.
_Avoid_: super-admin, root

**Prospective Owner**:
The Telegram account attached to a pending Business Registration. It does not have active Owner privileges until the Business is approved.
_Avoid_: Owner (before approval)

### Tenancy

**Business**:
A tenant (e.g., a restaurant) with its own Waiters, Managers, and Transactions. Created by self-serve Registration, activated only after Platform Owner approval (lifecycle: pending → active / rejected). A Telegram account belongs to at most one Business. Its name is a display label, not an identifier — duplicate names are allowed.
_Avoid_: tenant, organization, restaurant

**Registration**:
A request from a Telegram account without an active Business Membership to create a Business and become its Owner after Platform Owner approval. A rejected Registration may be revised and resubmitted.
_Avoid_: signup, account creation

**Invite**:
A Manager's grant letting one specific Telegram account join their Business as a Waiter. An Owner may grant either Waiter or Manager membership. Bound to the invitee's Telegram ID at creation via Telegram's native user picker; redeemed automatically when that person starts the bot.
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

**Mini App**:
Birr Track's Telegram Mini App, where Waiters review their Transactions, Managers and Owners review Business Transactions and manage members, and the Platform Owner reviews Registrations and oversees Businesses.
_Avoid_: Admin Panel, dashboard, admin site, web app

**Mini App Session**:
Server-managed authenticated state for an open Mini App. Created only after Telegram `initData` validation, renewable while the Mini App remains visible, and bounded by idle and absolute expiry.
_Avoid_: Admin Panel Session, login session, browser session, Telegram session

### Infrastructure

**VLM Worker**:
The RunPod serverless endpoint that runs the fine-tuned Qwen2.5-VL-3B-Instruct + LoRA adapter for Receipt extraction. Accepts base64-encoded image in JSON, returns structured Transaction fields. Called by the backend via RunPod's `/runsync` API. Model weights live on a RunPod Network Volume (not baked into the Docker image).
_Avoid_: VLM service, inference server, model API
