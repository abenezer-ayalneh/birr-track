# Invites are bound to a Telegram ID captured via the native user picker

Invites (both Waiter- and Manager-typed) are bound to the invitee's true Telegram user ID at creation time. Because the Bot API cannot resolve a username to an ID, the inviting Manager runs the invite flow in the bot chat, where a `KeyboardButtonRequestUsers` button opens Telegram's native contact picker and the bot receives the picked users' real IDs. One picker selection may include up to ten people, but it creates an independent Invite for each account. Redemption is automatic: when an invited account starts the bot, it is recognized by ID and joined — no codes or links to leak.

## Considered options

- **Shareable invite links/QR codes** — lighter UX, but a leaked Manager-typed link grants manager access to whoever clicks first. Rejected once role-typed invites were chosen.
- **Username match at redemption** — stays inside the Mini App, but fails for users without a username and usernames are changeable (spoofing window). Rejected.

## Consequences

- The invite flow lives in the bot DM, not the Mini App; the Mini App's staff page links out to it.
- Invitees never type anything: "open @BirrTrackBot and press Start" completes the join.
