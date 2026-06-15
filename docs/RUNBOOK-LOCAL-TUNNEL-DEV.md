# Runbook: Local Development via Cloudflare Tunnel

**Owner:** Abenezer Ayalneh | **Frequency:** As needed (daily dev)
**Last Updated:** 2026-06-15 | **Last Run:** —

## Purpose

Expose your **locally running** backend and Mini App to the public internet over
stable HTTPS URLs so you can develop the full Telegram loop against real code
with hot-reload:

- **Backend** (`pnpm start:dev`, host port **3000**) → `https://local-api.abenezer-ayalneh.dev`
- **Mini App** (Vite, host port **5173**) → `https://local-app.abenezer-ayalneh.dev`

Both hostnames are served by a **single Cloudflare named tunnel** running on your
laptop. A **dedicated dev bot** (separate from prod `@birr_track_bot`) points its
webhook + Mini App at these URLs, so **production is never touched**.

```
                 Telegram servers
                        │  (webhook POST + Mini App webview load)
                        ▼
              Cloudflare edge (TLS, your zone)
                        │
        ┌───────────────┴────────────────┐
   local-api.*                       local-app.*
        │                                 │
        ▼          cloudflared (laptop)    ▼
  localhost:3000  ◄── one tunnel ──►  localhost:5173
   NestJS (watch)                     Vite (HMR)
        │
        ├── localhost:5432  Postgres  (docker compose, local)
        ├── localhost:6379  Redis     (docker compose, local)
        ├── localhost:9000  MinIO     (docker compose, local — NOT tunneled)
        └── api.runpod.ai   VLM Worker (remote — NOT tunneled)
```

**Why MinIO isn't tunneled:** receipt images are streamed through the backend's
own `GET /transactions/:id/image` endpoint (the DB stores only the object key),
so they ride the `local-api` tunnel. **Why RunPod isn't tunneled:** it's already
a remote serverless endpoint the backend calls outbound.

## Prerequisites

- [ ] macOS with [Homebrew](https://brew.sh)
- [ ] `abenezer-ayalneh.dev` active on Cloudflare (zone nameservers on Cloudflare) — you already run prod here
- [ ] Docker Desktop running (for local Postgres / Redis / MinIO)
- [ ] Node + `pnpm` (v11) installed
- [ ] A Telegram account you control
- [ ] RunPod API key + endpoint id `xn6nlxgzljerux` (reuse prod — it's remote)

---

## Part 1: One-Time Setup

### Step 1: Create a dedicated dev bot in BotFather

1. Open [@BotFather](https://t.me/BotFather) → `/newbot`.
2. Name: `Birr Track Dev`. Username: e.g. `birr_track_dev_bot` (must be unique and end in `bot`).
3. **Copy the bot token** — this is your `TELEGRAM_BOT_TOKEN` for local dev.

**Expected result:** BotFather returns an HTTP API token like `8xxxxxxxxx:AA...`.
**If it fails:** the username is taken — pick another ending in `bot`.

> The Mini App is launched from an inline **`web_app` button built from
> `FRONTEND_APP_URL`** (see `src/telegram/flows/receipt.service.ts`), so you do
> **not** need to configure anything else in BotFather. (Optional convenience:
> `/setmenubutton` → choose the dev bot → URL `https://local-app.abenezer-ayalneh.dev`
> to also get the persistent menu button.)

### Step 2: Install and authenticate cloudflared

```bash
brew install cloudflared
cloudflared tunnel login
```

A browser opens — pick the **`abenezer-ayalneh.dev`** zone and authorize.

**Expected result:** `~/.cloudflared/cert.pem` is written.
**If it fails:** make sure you're logged into the Cloudflare account that owns the zone.

### Step 3: Create the named tunnel

```bash
cloudflared tunnel create birr-track-local
```

**Expected result:** prints a tunnel **UUID** and writes credentials to
`~/.cloudflared/<UUID>.json`. Note the UUID.
**If it fails:** `cloudflared tunnel list` to check it doesn't already exist.

### Step 4: Route both hostnames to the tunnel (DNS)

```bash
cloudflared tunnel route dns birr-track-local local-api.abenezer-ayalneh.dev
cloudflared tunnel route dns birr-track-local local-app.abenezer-ayalneh.dev
```

**Expected result:** two **proxied CNAME** records (`→ <UUID>.cfargotunnel.com`)
appear in the Cloudflare dashboard. Single-level subdomains, so free Universal
SSL covers them.
**If it fails:** if a record already exists, delete the conflicting one in the CF
dashboard and re-run.

### Step 5: Write the tunnel config

Create `~/.cloudflared/config.yml` (replace `<UUID>` with the value from Step 3):

```yaml
tunnel: birr-track-local
credentials-file: /Users/abeni/.cloudflared/<UUID>.json

ingress:
  - hostname: local-api.abenezer-ayalneh.dev
    service: http://localhost:3000      # backend listens on 3000 in `pnpm start:dev`
  - hostname: local-app.abenezer-ayalneh.dev
    service: http://localhost:5173      # Vite dev server
  - service: http_status:404
```

> **Critical:** the backend always calls `app.listen(3000)` (see `src/main.ts`).
> `BACKEND_PORT=3004` is **only** the Docker host-published port and does not
> apply when you run `pnpm start:dev` on the host. Point the tunnel at **3000**.

---

## Part 2: Project Configuration

### Step 6: Point Vite at the tunnel

Vite 6 blocks unknown `Host` headers and tries to open the HMR socket against
`localhost`. Edit `birr-track-miniapp/vite.config.ts`:

```ts
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Allow the tunnel hostname through Vite 6's host check.
    allowedHosts: ['local-app.abenezer-ayalneh.dev'],
    // Route HMR over the public HTTPS tunnel (wss on 443) instead of ws://localhost.
    hmr: {
      host: 'local-app.abenezer-ayalneh.dev',
      protocol: 'wss',
      clientPort: 443,
    },
  },
})
```

**Expected result:** loading the app via the tunnel no longer shows
"Blocked request. This host is not allowed," and the browser console shows the
HMR client connecting to `wss://local-app.abenezer-ayalneh.dev`.

### Step 7: Set the backend env (root `.env` = local dev)

Your root `.env` currently holds **prod** values, and it's the file both the
backend (`ConfigModule`) and the infra (`compose.yaml` → `env_file: ../.env`)
read. Back it up, then replace it.

```bash
cd /Users/abeni/Documents/MyFiles/projects/misc/birr-track
cp .env .env.production          # stash prod values (gitignored by .env.*)
mv birr-track-backend/.env birr-track-backend/.env.bak   # remove split-brain override
```

Now write `.env` (secrets are placeholders — generate with `openssl rand -base64 32`):

```dotenv
# App
BACKEND_PORT=3004
MINI_APP_PORT=3003
APP_BASE_URL=https://local-api.abenezer-ayalneh.dev
NODE_ENVIRONMENT=development
CORS_ALLOWED_ORIGINS=https://local-app.abenezer-ayalneh.dev
FRONTEND_APP_URL=https://local-app.abenezer-ayalneh.dev

# Auth
JWT_SECRET=<openssl rand -base64 32>
PLATFORM_OWNER_TELEGRAM_ID=343675433
TELEGRAM_INITDATA_EXPIRES_SECONDS=300

# Throttle
THROTTLER_TTL=60000
THROTTLER_LIMIT=30

# Database (local docker compose)
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=birr_track

# Redis (local docker compose)
REDIS_HOST=localhost
REDIS_PORT=6379

# RunPod VLM Worker (remote — reuse prod)
RUNPOD_API_KEY=<your-runpod-api-key>
RUNPOD_ENDPOINT_ID=xn6nlxgzljerux
VLM_REQUEST_TIMEOUT_MS=120000

# Telegram (DEV bot from Step 1)
TELEGRAM_BOT_TOKEN=<dev-bot-token>
TELEGRAM_WEBHOOK_SECRET=<openssl rand -hex 32>   # HEX ONLY — Telegram's secret_token rejects base64 (+ / =)
TELEGRAM_WEBHOOK_BASE_URL=https://local-api.abenezer-ayalneh.dev
TELEGRAM_WEBHOOK_PATH=/telegram/webhook
TELEGRAM_PHOTO_RATE_LIMIT=30
TELEGRAM_PHOTO_RATE_WINDOW_SECONDS=60
TELEGRAM_FILE_DOWNLOAD_TIMEOUT_MS=30000

# Object Storage (local MinIO)
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_REGION=us-east-1
STORAGE_BUCKET=birr-track-receipts
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_FORCE_PATH_STYLE=true
MINIO_API_PORT=9000
MINIO_CONSOLE_PORT=9001
```

> **`RUNPOD_ENDPOINT_ID` must be the bare id `xn6nlxgzljerux`** — the code builds
> `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/runsync` (see
> `src/processing/vlm.service.ts`). The full console URL that was previously in
> `.env` produces a broken request URL. **Check your VPS prod `.env` for the same
> mistake.**

> **`STORAGE_ENDPOINT` (`:9000`) and `MINIO_API_PORT` (`9000`) must agree** — the
> app reaches MinIO at `STORAGE_ENDPOINT`, and compose publishes it at
> `MINIO_API_PORT:9000`. The shipped `.env.example` has them mismatched (9000 vs
> 9002); keep them equal.

**Expected result:** `.env` reflects localhost infra, the dev bot, and the tunnel URLs.

### Step 8: Set the Mini App env

Vite reads env from the **miniapp** directory, not the root `.env`. Create
`birr-track-miniapp/.env.local`:

```dotenv
VITE_API_BASE_URL=https://local-api.abenezer-ayalneh.dev
VITE_BOT_USERNAME=birr_track_dev_bot
```

**Expected result:** the app uses the real HTTP client against `local-api`
(when `VITE_API_BASE_URL` is unset it silently falls back to the mock client).
`.env.local` is gitignored.

### Step 9: Enable Mini App devtools in Telegram Desktop (macOS)

You'll debug the Mini App in Telegram Desktop, which embeds a Chromium webview
with full devtools once unlocked.

1. Telegram Desktop → **Settings → Advanced → Experimental settings**.
2. Toggle the webview-inspector option (wording varies by version — look for
   **"Enable webview inspecting"** / "Debug Mini Apps").
3. Quit and reopen Telegram Desktop.
4. Open the Mini App via the dev bot → **right-click inside it → Inspect Element**.

**Expected result:** Chromium devtools open. Use the **Console** to confirm the
HMR client connected to `wss://local-app.abenezer-ayalneh.dev`, and the
**Network** tab to watch API calls hit `local-api`.
**If there's no toggle:** update Telegram Desktop — older builds lack it; the
phone client has no devtools at all, so debug via backend logs there.

---

## Part 3: Daily Run Sequence

Run each in its own terminal, in this order. The tunnel URLs are stable, so
**Steps 3–4 below are one-time** unless you change the bot or secret.

```bash
# 1. Local infra (Postgres + Redis + MinIO)
cd birr-track-backend && docker compose up -d

# 2. Migrations (first run, and after any schema change)
pnpm db:migrate

# 3. Backend with watch  → listens on :3000   [terminal A]
pnpm start:dev

# 4. Mini App with HMR   → listens on :5173   [terminal B]
cd ../birr-track-miniapp && pnpm dev

# 5. Cloudflare tunnel                          [terminal C]
cloudflared tunnel run birr-track-local

# 6. Register the DEV bot webhook (ONE-TIME for a stable URL)
cd ../birr-track-backend && pnpm telegram:webhook
```

**Expected result of Step 6:** prints `Webhook setup succeeded`, URL
`https://local-api.abenezer-ayalneh.dev/telegram/webhook/<secret>`, `Pending
updates: 0`, no `Last error`.

> **After changing any secret in `.env`, restart `pnpm start:dev`** — `nest --watch`
> reloads on source changes, not `.env` changes, so the running backend keeps the
> old `TELEGRAM_WEBHOOK_SECRET` and rejects incoming updates until restarted.

> First time only: if the Postgres volume was previously initialized with the
> **prod** password, the app's `postgres` password won't match. Reset it:
> `docker compose down -v && docker compose up -d` (wipes local dev data), then re-run migrations.

---

## Part 4: Verify End-to-End

1. **Backend reachable through the tunnel:**
   ```bash
   curl https://local-api.abenezer-ayalneh.dev/health
   ```
   **Expected:** HTTP 200.

2. **Mini App loads in Telegram:** open your **dev** bot → `/start` → tap
   **📱 Open Mini App** (or the menu button). It loads from `local-app` and pulls
   data from `local-api`. Confirm a list/table renders (real backend, not mock).

3. **Receipt pipeline:** send a receipt photo to the dev bot. Watch terminal A:
   webhook update → image stored in MinIO → RunPod extraction → transaction saved.
   Open the transaction in the Mini App and confirm the **image renders** (proves
   `GET /transactions/:id/image` streams through the tunnel).

4. **Realtime loop:**
   - Edit a Mini App component → HMR updates inside Telegram (reopen the app if it stalls — see troubleshooting).
   - Edit a backend file → `nest --watch` restarts; the webhook stays pointed at the stable URL, no re-registration needed.

---

## Part 5: Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| Cloudflare **1033** / "tunnel not found" | `cloudflared` not running, or `config.yml` hostname ≠ DNS route. Start Step 5, check `cloudflared tunnel list`. |
| Cloudflare **530 / 1016** | DNS record missing — re-run `cloudflared tunnel route dns ...` (Step 4). |
| Vite **"Blocked request. This host is not allowed"** | Add the hostname to `server.allowedHosts` (Step 6). |
| **HMR not updating in Telegram** | Telegram caches the Mini App aggressively. Close & reopen via the button; if still stale, fully quit/reopen Telegram. Verify the `hmr` block (Step 6) and that the tunnel is up. |
| **403** on Mini App → API calls | `CORS_ALLOWED_ORIGINS` must **exactly** equal `https://local-app.abenezer-ayalneh.dev` (https, no trailing slash). Restart the backend after editing `.env`. |
| `setWebhook` **400** "secret token contains unallowed characters" | `TELEGRAM_WEBHOOK_SECRET` must be `A-Za-z0-9_-` only — regenerate with `openssl rand -hex 32` (NOT base64), restart the backend, re-run. |
| Webhook `last_error`: "Wrong response 404" | Backend not running, wrong `TELEGRAM_WEBHOOK_BASE_URL`, or secret mismatch. Re-run `pnpm telegram:webhook`. |
| Endless 401/403 → retry in the app | `initData` expired (`TELEGRAM_INITDATA_EXPIRES_SECONDS=300`) or device clock skew. Reopen the Mini App. |
| RunPod / VLM failures | `RUNPOD_ENDPOINT_ID` must be `xn6nlxgzljerux` (bare id, not console URL); confirm `RUNPOD_API_KEY`. |
| DB `password authentication failed` | Postgres volume initialized with a different password. `docker compose down -v && docker compose up -d`, then `pnpm db:migrate`. |
| MinIO image 500 / `NoSuchBucket` | `STORAGE_ACCESS_KEY/SECRET` must match between app and container; `STORAGE_ENDPOINT` port must equal `MINIO_API_PORT` (both `9000`). Backend creates the bucket on boot. |
| Mini App shows prod data | You opened `@birr_track_bot`. Use the **dev** bot. |

---

## Part 6: Teardown / Switch Back to Prod

```bash
# Stop the three terminals (Ctrl-C), then:
cd birr-track-backend && docker compose down        # add -v to wipe local data

# Restore prod values locally if you need them (e.g. to run the prod compose):
cd .. && cp .env.production .env
```

**Nothing to restore on Telegram:** prod uses a separate bot on a separate VPS
and was never repointed. Deregistering the dev webhook is optional (it's harmless
to leave a stable dev webhook in place for next session).

---

## Appendix: Port & URL Reference

| Service | Local (host) | Tunnel hostname | Notes |
|---|---|---|---|
| Backend (NestJS) | `:3000` | `local-api.abenezer-ayalneh.dev` | `app.listen(3000)`; 3004 is Docker-only |
| Mini App (Vite) | `:5173` | `local-app.abenezer-ayalneh.dev` | `host: true`, HMR over wss:443 |
| Postgres | `:5432` | — | local compose |
| Redis | `:6379` | — | local compose |
| MinIO API / Console | `:9000` / `:9001` | — | streamed via backend, not tunneled |
| RunPod VLM Worker | — | `api.runpod.ai` | remote, outbound only |

**Webhook URL:** `https://local-api.abenezer-ayalneh.dev/telegram/webhook/<TELEGRAM_WEBHOOK_SECRET>`
