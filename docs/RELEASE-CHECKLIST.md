# First Release Checklist

Target setup (agreed): single VPS running backend + Postgres + Redis + Mini App static files behind a reverse proxy with HTTPS; VLM service on GPU (or same box via Ollama CPU while volume is low).

## Release blockers (the app is not shippable without these)

- [x] **Lock down the REST API.** Every `/transactions` endpoint is currently unauthenticated — anyone with the URL can read, edit, and export all data. JWT auth from Mini App `initData` + business scoping (spec §5).
- [x] **Stop storing bot-token URLs.** `imageUrl` currently persists `https://api.telegram.org/file/bot<TOKEN>/…` — a credential leak in the DB. Migrate to object-storage keys; scrub existing rows.
- [ ] **HTTPS everywhere.** Telegram requires HTTPS for the webhook *and* the Mini App URL. Caddy (automatic Let's Encrypt) or nginx + certbot.
- [x] **Telegram webhook secret.** Set `secret_token` on `setWebhook` and verify the `X-Telegram-Bot-Api-Secret-Token` header so nobody can forge updates to your webhook endpoint.
- [x] **Rate limiting on the bot path.** A hostile user can flood photos and exhaust your VLM queue/GPU; per-user throttle before enqueueing (the throttler guard exists for HTTP — the bot path needs its own).
- [ ] **Database backups.** Nightly `pg_dump` to object storage + restore drill once. Receipts are financial records; losing them is product death.
- [x] **Migrations for the new schema** (users, invites, business status, transaction columns) tested against a copy of real data, not just empty DB.

## Strongly recommended for v1

- [~] **VLM fallback behavior.** If the VLM service is down, jobs should retry with backoff and Receipts should land as `needs_review` rather than failing the queue forever; the waiter ack already promised them the receipt was received. *(Partial: errors caught and default to needs_review, but no explicit retry with backoff.)*
- [x] **Idempotent photo handling.** Telegram redelivers updates on webhook timeouts; dedupe by `update_id`/`file_unique_id` so one Receipt doesn't become two Transactions.
- [x] **Timezone correctness.** Receipts and reports are Ethiopia-local (EAT, UTC+3); decide that summary "today" means EAT, and render timestamps in EAT in the Mini App. (Ethiopian-calendar display can wait, but don't mix calendars in math.)
- [ ] **Amharic in the bot.** Waiter-facing bot messages in Amharic (or AM/EN toggle); waiters are the least technical users.
- [~] **Monitoring & alerts.** Uptime check on webhook + VLM health endpoint; error alerting (Sentry free tier) — you won't be watching logs, and a dead webhook is silent. *(Partial: /health endpoints exist on backend and VLM service, but no Sentry or external alerting.)*
- [ ] **Queue dashboard.** Bull Board (or similar) behind auth so you can see stuck/failed extraction jobs.
- [ ] **Confidence threshold tuning.** Decide the confidence cutoff below which a Transaction is `needs_review` even if all fields parsed — bad reads with high field-completeness are the dangerous ones.
- [ ] **Pilot plan.** One friendly business (maybe your own test Business) for 1–2 weeks before inviting strangers; the registration-approval flow gives you a natural gate.

## Nice to have / soon after

- [ ] Re-extraction button (manager triggers VLM re-run after model improvements).
- [ ] Daily summary DM to managers ("Yesterday: 47 receipts, 12,300 ETB, 2 need review").
- [ ] Waiter corrections (EditLog) exported as training data for the fine-tuned model.
- [ ] Business settings (name change, report currency formatting).
- [ ] Magic-link desktop access for managers who live in spreadsheets (ADR-0001 consequence).
