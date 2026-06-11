# Telegram is the only identity provider

The Admin Panel is a Telegram Mini App, and all users (Waiters, Managers, Owners, the Platform Owner) are identified solely by their Telegram user ID, authenticated via Telegram's signed `initData`. There are no passwords, emails, or standalone accounts — the pre-existing `Manager.email` / `Manager.passwordHash` columns are deliberately removed, not extended.

## Consequences

- Anyone locked out of their Telegram account is locked out of Birr Track; account recovery is Telegram's problem, not ours.
- The Admin Panel cannot be opened in a plain browser (no `initData` there). If desktop access is ever needed, a tokenized magic-link flow must be added — that was considered and deferred, not rejected.
- Backend sessions are short-lived JWTs minted after server-side `initData` HMAC validation; no credential storage anywhere.
