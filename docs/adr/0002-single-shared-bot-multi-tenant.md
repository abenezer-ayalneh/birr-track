# One shared bot serves all Businesses

Birr Track is multi-tenant from day one, but runs a single Telegram bot (one token, one webhook, one Mini App URL) for every Business. A Telegram account is mapped to exactly one Business at registration/invite time; the bot resolves the sender's Business from their Telegram ID on every message.

## Considered options

- **Bot per Business** — stronger isolation and per-business branding, but N tokens/webhooks to manage and a multi-bot-aware backend. Rejected as disproportionate ops cost for v1.
- **Shared bot + per-business group chats** — changes the UX from DM to group posting; rejected to keep receipt submission private per waiter.

## Consequences

- One person cannot work at two Businesses with the same Telegram account. Accepted; revisit only if a real customer hits it.
- Every query and report must be scoped by `businessId` — including duplicate detection, which is per-Business, not global.
