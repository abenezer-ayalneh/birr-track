# Mini App registration with bot-owned Invites

**Status**: Accepted

Business Registration is collected in the Telegram Mini App using signed Telegram `initData`; ID-bound Invite creation and redemption remain in the bot. This keeps first-time Business onboarding short while preserving Telegram's native user-picker boundary for staff access. The Mini App exposes signed preflight states, including pending and rejected Registrations, but a Prospective Owner receives no normal Admin Panel session until approval.
