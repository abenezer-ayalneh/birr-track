# Runbook: Full Deployment

**Owner:** Abenezer Ayalneh | **Frequency:** As needed
**Last Updated:** 2026-06-14 | **Last Run:** —

## Purpose

Deploy Birr Track end-to-end:

- **VPS (Ubuntu 22.04/24.04):** NestJS backend, Vite Admin Panel, PostgreSQL, Redis, MinIO, Caddy (auto-HTTPS)
- **RunPod Serverless:** Fine-tuned Qwen2.5-VL-3B Receipt extraction (VLM Worker)

Domains:
- API: `birr-track-api.abenezer-ayalneh.dev`
- Admin Panel: `birr-track-telegram-app.abenezer-ayalneh.dev`

## Prerequisites

- [ ] VPS with Ubuntu 22.04 or 24.04, root/sudo SSH access
- [ ] Domain `abenezer-ayalneh.dev` with DNS control (Cloudflare, Namecheap, etc.)
- [ ] Telegram Bot Token from [@BotFather](https://t.me/BotFather)
- [ ] Docker Hub account: `abenezerayalneh`
- [ ] RunPod account (create at [runpod.io](https://runpod.io))
- [ ] `qwen25vl-3b-birrtrack-lora.zip` (the trained LoRA adapter)
- [ ] GitHub repo is public — no deploy key needed

---

## Part 1: VPS Initial Setup

### Step 1: SSH in and update

```bash
ssh root@<VPS_IP>
apt update && apt upgrade -y
```

**Expected result:** System packages updated.
**If it fails:** Check your SSH key/password and VPS provider console.

### Step 2: Create a deploy user

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
echo "deploy ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
```

**Expected result:** You can `ssh deploy@<VPS_IP>`.
**If it fails:** Verify `authorized_keys` was copied correctly.

### Step 3: Firewall

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

**Expected result:** `ufw status` shows SSH, 80, 443 allowed.

### Step 4: Install Docker

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
```

Log out and back in as `deploy`:

```bash
ssh deploy@<VPS_IP>
docker --version
docker compose version
```

**Expected result:** Docker 24+ and Compose v2 installed.
**If it fails:** Follow [Docker's official Ubuntu install guide](https://docs.docker.com/engine/install/ubuntu/).

### Step 5: Add swap (if VPS has ≤2GB RAM)

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## Part 2: DNS Records

Add two A records pointing to your VPS IP:

| Type | Name                              | Value       | TTL  |
|------|-----------------------------------|-------------|------|
| A    | birr-track-api                    | `<VPS_IP>`  | Auto |
| A    | birr-track-telegram-app           | `<VPS_IP>`  | Auto |

**Expected result:** `dig birr-track-api.abenezer-ayalneh.dev` returns your VPS IP.
**If it fails:** Wait 5–10 minutes for DNS propagation. **Use Cloudflare DNS-only (grey cloud) for `birr-track-api`** — with the orange-cloud proxy on, Caddy can't complete the Let's Encrypt challenge *and* Cloudflare's bot/WAF protection blocks Telegram's webhook POSTs with `403 Forbidden` (see Troubleshooting). `dig +short` should return your real VPS IP, not a `104.21.x.x`/`172.67.x.x` Cloudflare IP.

---

## Part 3: Clone and Configure

### Step 6: Clone the repo

```bash
ssh deploy@<VPS_IP>
sudo mkdir -p /home/birr-track
sudo chown deploy:deploy /home/birr-track
git clone https://github.com/abenezer-ayalneh/birr-track.git /home/birr-track
cd /home/birr-track
```

### Step 7: Create the production `.env`

All services read from a single root `.env` file. Copy the production template and fill in the empty values:

```bash
cp .env.production.example .env
```

Generate secrets:

```bash
openssl rand -hex 24   # use for DATABASE_PASSWORD
openssl rand -hex 24   # use for STORAGE_ACCESS_KEY
openssl rand -hex 24   # use for STORAGE_SECRET_KEY
openssl rand -hex 24   # use for TELEGRAM_WEBHOOK_SECRET
```

Edit `.env` and fill in:

| Variable | Where to get it |
|----------|----------------|
| `DATABASE_PASSWORD` | Generated above |
| `STORAGE_ACCESS_KEY` | Generated above |
| `STORAGE_SECRET_KEY` | Generated above |
| `TELEGRAM_BOT_TOKEN` | From [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_WEBHOOK_SECRET` | Generated above |
| `VITE_BOT_USERNAME` | Your bot's username (without @) |
| `RUNPOD_API_KEY` | From RunPod (fill in after Part 6) |
| `RUNPOD_ENDPOINT_ID` | From RunPod (fill in after Part 6) |

**Important:** Every empty value must be filled before starting services. The `DATABASE_URL` is not in the `.env` — the backend constructs it from the individual `DATABASE_*` variables.

> **Internal vs external ports — do not confuse them.** `DATABASE_PORT` (5432) and `REDIS_PORT` (6379) are the **internal** container ports the backend dials over the Docker network; they must match what the containers listen on and should not be changed. `DATABASE_EXTERNAL_PORT` (5433) and `REDIS_EXTERNAL_PORT` (6380) are the **VPS-host** ports published for outside access — change *these* if 5432/6379 are already taken on the host. Putting the external value into `DATABASE_PORT`/`REDIS_PORT` makes the backend fail with `ECONNREFUSED` (see Troubleshooting).

### Step 8: Verify deployment files

These files are already committed in the repo — verify they exist:

```bash
ls docker-compose.prod.yml birr-track-backend/Dockerfile birr-track-miniapp/Dockerfile caddy/birr-track.caddy
```

**Expected result:** All four files exist.

| File | Purpose |
|------|---------|
| `docker-compose.prod.yml` | Orchestrates all services (reads ports and credentials from `.env`) |
| `birr-track-backend/Dockerfile` | Multi-stage Node 22 build → production image |
| `birr-track-miniapp/Dockerfile` | Multi-stage Vite build → Nginx static serving (receives `VITE_*` as build args) |
| `caddy/birr-track.caddy` | Reverse proxy config for both subdomains |

---

## Part 4: Caddy Reverse Proxy

Caddy is already running on the VPS and serving other sites. Import this project's config:

```bash
echo 'import /home/birr-track/caddy/birr-track.caddy' | sudo tee -a /etc/caddy/Caddyfile

sudo caddy validate --config /etc/caddy/Caddyfile

sudo systemctl reload caddy
```

**Expected result:** `caddy validate` reports no errors. After reload, Caddy serves both new subdomains alongside existing sites.
**If it fails:** Check that the import path is correct and there are no duplicate site addresses across your Caddyfiles.

> **Note:** `caddy/birr-track.caddy` hardcodes `localhost:3004` (backend) and `localhost:3003` (Admin Panel). If you change `BACKEND_PORT` or `MINI_APP_PORT` in `.env`, you must also update the ports in that file.

---

## Part 5: First Deploy on VPS

### Step 9: Start everything

```bash
cd /home/birr-track

set -a && source .env && set +a

docker compose -f docker-compose.prod.yml up -d --build
```

**Expected result:** All containers running: `docker compose -f docker-compose.prod.yml ps` shows all healthy.

### Step 10: Run database migrations

```bash
docker compose -f docker-compose.prod.yml exec backend node ./node_modules/typeorm/cli -d dist/src/database/data-source.js migration:run
```

**Expected result:** Migrations applied successfully.
**If it fails:** Check that `DATABASE_HOST=postgres` and `DATABASE_PASSWORD` are set correctly in `.env`. The host must be `postgres` (the Docker service name), not `localhost`.

### Step 11: Create the MinIO bucket

```bash
# Runs inside the minio container, so it uses the creds/bucket name compose already injected
# there (MINIO_ROOT_USER/PASSWORD/STORAGE_BUCKET) — no need to `source .env`, and the +/=/
# characters in the keys can't break. 9000 is the S3 API port INSIDE the container (console is
# 9003); the host ports 9002/9003 do not apply here.
docker compose -f docker-compose.prod.yml exec minio sh -c \
  'mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" && mc mb "local/$STORAGE_BUCKET" --ignore-existing && mc ls local'
```

**Expected result:** Bucket created (or already exists).

### Step 12: Set up the Telegram webhook

> **Prerequisite:** `.env` must contain `TELEGRAM_WEBHOOK_PATH=/telegram/webhook` (it's in `.env.production.example`). The backend's auth guard only treats this path as public when this var is set — otherwise every webhook POST is rejected with **403 Forbidden**. If you set it after first deploy, re-source `.env` and recreate the backend.

The backend route is `POST /telegram/webhook/:secret` — the **trailing path segment is required**, and it must be the **real secret**. Two failure modes to avoid:
- URL `/telegram/webhook` (no segment) → Nest returns `Cannot POST /telegram/webhook`.
- URL `/telegram/webhook/` (empty segment, from an unset `$TELEGRAM_WEBHOOK_SECRET`) → Nest returns `Cannot POST /telegram/webhook/`.

**Preferred — use the bundled script** (validates inputs, falls back to a non-empty secret, drops stale pending updates). Run it *inside the container* so it reads the already-correct env, sidestepping shell-variable mistakes:

```bash
docker compose -f docker-compose.prod.yml exec backend node dist/src/scripts/setup-telegram-webhook.js
```

It prints the final URL and `getWebhookInfo`. Confirm the URL ends with your real secret, not a bare `/telegram/webhook/`.

**Alternative — manual curl.** You **must** source `.env` first and confirm the secret is non-empty, or you'll set an empty-secret URL:

```bash
cd /home/birr-track && set -a && source .env && set +a
[ -n "$TELEGRAM_WEBHOOK_SECRET" ] && echo "secret OK (len ${#TELEGRAM_WEBHOOK_SECRET})" || { echo "EMPTY — do not proceed"; }

curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"${TELEGRAM_WEBHOOK_BASE_URL}/telegram/webhook/${TELEGRAM_WEBHOOK_SECRET}\",
    \"secret_token\": \"${TELEGRAM_WEBHOOK_SECRET}\"
  }"
```

**Expected result:** `{"ok":true,"result":true,"description":"Webhook was set"}`

Confirm it's healthy (no `last_error_message`, `url` ends with the secret, `pending_update_count` drains):

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

### Step 13: Verify

```bash
curl https://birr-track-api.abenezer-ayalneh.dev/health

curl -sI https://birr-track-telegram-app.abenezer-ayalneh.dev | head -5
```

**Expected result:** Backend returns a JSON health response; Admin Panel returns `200 OK`.

---

## Part 6: RunPod VLM Worker Setup

### Step 14: Build and push the VLM Docker image

On your local machine:

```bash
cd vlm-inference

docker build --platform linux/amd64 -t abenezerayalneh/birr-track-vlm:latest .

docker push abenezerayalneh/birr-track-vlm:latest
```

**Expected result:** Image pushed to Docker Hub.
**If it fails:** `docker login` first.

### Step 15: Create a RunPod Network Volume

1. Log in to the [RunPod console](https://www.console.runpod.io)
2. Go to the **Storage** page ([console.runpod.io/user/storage](https://www.console.runpod.io/user/storage))
3. Click **New Network Volume** and configure:
   - **Data center:** Pick one in a cheap GPU region (e.g. `EU-RO-1` or `US-KS-2`). The volume is **pinned to this data center**, and any Serverless worker that mounts it can only run there — so choose a region that actually has the GPU you want (Step 17).
   - **Name:** `birr-track-models`
   - **Size:** 15 GB (can be increased later, never decreased)
   - **Storage tier:** **Standard** (High-Performance is overkill for a 7 GB model load)
4. Click **Create Network Volume** and note the volume name/ID.

### Step 16: Download model weights to the Network Volume

Create a temporary GPU Pod with the network volume attached:

1. Go to **Pods** → **Deploy**
2. Click **Network Volume** and select `birr-track-models` (this locks the GPU list to the volume's data center)
3. Pick any cheap GPU offered there (e.g. RTX 3090)
4. Set the template to `pytorch/pytorch:2.4.1-cuda12.1-cudnn9-runtime`
5. Click **Deploy On-Demand**, then open the pod's **web terminal** (or SSH in)

> **Mount path:** On a **Pod** the network volume mounts at **`/workspace`**. The *same* volume mounts at **`/runpod-volume`** on Serverless workers (Step 17). So write the files under `/workspace/...` here, and reference them as `/runpod-volume/...` in the endpoint's env vars later — they are the same bytes, just a different mount point.

```bash
pip install "huggingface_hub[cli]"

HF_HOME=/workspace/hf-cache huggingface-cli download Qwen/Qwen2.5-VL-3B-Instruct

mkdir -p /workspace/adapter
# Upload qwen25vl-3b-birrtrack-lora.zip via the RunPod web UI or SCP, then:
cd /workspace/adapter
unzip /workspace/qwen25vl-3b-birrtrack-lora.zip
ls /workspace/adapter/
```

**Expected result:** `/workspace/hf-cache` has the base model, `/workspace/adapter` has `adapter_config.json` + `adapter_model.safetensors`. (These will appear at `/runpod-volume/hf-cache` and `/runpod-volume/adapter` inside the Serverless worker.)

6. **Stop and terminate the temporary pod** (the network volume persists).

### Step 17: Create the Serverless Endpoint

The RunPod console now asks for a deployment **source** before showing the config form, and several fields were renamed/moved. Follow the current flow exactly:

1. Go to the [**Serverless**](https://www.console.runpod.io/serverless) section and click **New Endpoint**.
2. For the source, click **Import from Docker Registry**.
   - In the **Container Image** field, enter `docker.io/abenezerayalneh/birr-track-vlm:latest`, then click **Next**.

   > **Tip:** If you host this repo on GitHub instead, you can pick **Import Git Repository** and let RunPod build the image for you — but this runbook uses the Docker Hub image pushed in Step 14.

3. On the configuration screen, set:
   - **Endpoint Name:** `birr-track-vlm`
   - **Endpoint Type:** **Queue** (the backend calls `/runsync`; do **not** pick Load Balancer)
   - **GPU Configuration:** select a 16 GB+ tier such as **RTX 3090** / **RTX A4000** (~$0.20–0.40/hr). You can add a second/third GPU type as a priority fallback to improve availability — but every type must exist in the network volume's data center (Step 15).
   - **Active Workers:** `0` (this is the old "Min Workers" — keep at 0 to scale to zero when idle)
   - **Max Workers:** `1`
   - **GPUs per Worker:** `1`
   - **Idle Timeout:** `5` seconds
   - **FlashBoot:** leave **enabled** (faster cold starts, no extra idle cost)
   - **Model:** leave empty — the model comes from the network volume, not RunPod's model cache
   - **Environment Variables:**
     - `HF_HOME=/runpod-volume/hf-cache`
     - `LORA_ADAPTER_PATH=/runpod-volume/adapter`
     - `VLM_BACKEND=peft`
     - `HF_BASE_MODEL=Qwen/Qwen2.5-VL-3B-Instruct`
4. Expand **Advanced** and set:
   - **Network Volumes:** select `birr-track-models` (mounts at `/runpod-volume`; this also pins the endpoint to the volume's data center)
   - **Execution Timeout:** `120` seconds (default is 600s)
   - Leave **Data Centers**, **CUDA Version**, and **Expose HTTP/TCP Ports** at their defaults
5. Click **Deploy Endpoint**.
6. Open the new endpoint and copy its **Endpoint ID** (also visible in the endpoint URL `https://api.runpod.ai/v2/<endpoint_id>/`).

> **Note:** "Active Workers" are billed continuously, so keep it at `0`. To attach the network volume *after* creation, use the three-dots menu → **Edit Endpoint** → **Advanced** → **Network Volumes** → **Save Endpoint**.

### Step 18: Get your API key and update the VPS

1. Go to **Settings** → **API Keys** ([console.runpod.io/user/settings](https://www.console.runpod.io/user/settings))
2. Create a new key (give it at least **Read/Write** on Serverless) or copy an existing one
3. Update `.env` on the VPS:

```bash
ssh deploy@<VPS_IP>
cd /home/birr-track
# Edit .env — set RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID

# Restart the backend to pick up the new values
set -a && source .env && set +a
docker compose -f docker-compose.prod.yml up -d --build backend
```

### Step 19: Test the VLM Worker

Run this where `.env` is sourced (the VPS, or your machine with the two vars exported).

First confirm the test file is a format Pillow can read — a real **JPEG/PNG**, not an iPhone/macOS **HEIC** (the worker decodes with Pillow, which can't read HEIF):

```bash
file ./documents/receipts/cbe_screenshot_1.jpg   # must report "JPEG image data" or "PNG image data"
# If it says HEIF/HEIC/ISO Media (common on macOS), convert first:
#   sips -s format jpeg input.heic --out test-receipt.jpg
```

Build the request body with a real encoder and send it. This avoids the base64 line-wrap and shell-quoting bugs you get from inlining `$(base64 …)` into `-d` (single quotes don't expand `$( )` at all; double quotes need the inner JSON quotes escaped). Works the same on macOS and Linux:

```bash
IMG=./documents/receipts/cbe_screenshot_1.jpg
python3 -c "import base64,json,sys;print(json.dumps({'input':{'image_base64':base64.b64encode(open(sys.argv[1],'rb').read()).decode()}}))" "$IMG" > /tmp/vlm-payload.json

curl -s -X POST "https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/runsync" \
  -H "Authorization: Bearer ${RUNPOD_API_KEY}" \
  -H "Content-Type: application/json" \
  --data @/tmp/vlm-payload.json
```

**Expected result:** JSON with `status: "COMPLETED"` and extracted Transaction fields (`bankName`, `amount`, etc.). The first request after idle is slow (~15–30s cold start while the model loads).
**If it fails:** Check endpoint logs in RunPod dashboard → Endpoint → Logs. For `cannot identify image file`, the bytes the worker received aren't a valid image — re-check the `file` output and make sure you used the `python3` encoder above, not an inline `$(base64 …)`.

---

## Part 7: GitHub Actions CI/CD

The workflow file is at `.github/workflows/deploy.yml`.

### Step 20: Add secrets to GitHub

Go to your repo → Settings → Secrets and variables → Actions. Add:

| Secret                   | Value                                |
|--------------------------|--------------------------------------|
| `VPS_HOST`               | Your VPS IP                          |
| `VPS_USER`               | `deploy`                             |
| `VPS_SSH_KEY`            | Private SSH key for `deploy` user    |
| `DOCKERHUB_USERNAME`     | `abenezerayalneh`                    |
| `DOCKERHUB_TOKEN`        | Docker Hub access token              |

**Expected result:** Pushing to `main` triggers the deploy workflow. Include `[vlm]` in a commit message to also rebuild and push the VLM Worker image.

---

## Verification

- [ ] `curl https://birr-track-api.abenezer-ayalneh.dev/health` returns OK
- [ ] `curl https://birr-track-telegram-app.abenezer-ayalneh.dev` returns HTML
- [ ] Send a Receipt image to the Telegram bot → Transaction is created
- [ ] RunPod dashboard shows the endpoint received a request
- [ ] `docker compose -f docker-compose.prod.yml ps` shows all containers healthy

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Caddy 502 Bad Gateway | Backend container not running or port mismatch | `docker compose -f docker-compose.prod.yml logs backend` — verify `BACKEND_PORT` in `.env` matches port in `caddy/birr-track.caddy` |
| Caddy TLS error | DNS not pointing to VPS / port 80 or 443 blocked | Check `dig` output, `ufw status`, and `journalctl -u caddy` |
| RunPod TIMEOUT | Model not loaded / wrong volume mount | Check endpoint logs in RunPod dashboard |
| Worker logs `RuntimeError: LORA_ADAPTER_PATH is not set or does not exist` → `worker exited with exit code 1` | The worker can't find `adapter_config.json` at the resolved path. Causes: (a) network volume not attached to the endpoint, (b) `LORA_ADAPTER_PATH` env var missing/typo, or (c) the volume was never populated — the **most common** cause is writing to `/runpod-volume/...` on a **Pod**, which is ephemeral; a Pod mounts the volume at **`/workspace`**, so those files were lost on Pod termination | Attach a Pod with the volume and run `find /workspace -name adapter_config.json`. If nothing is found, re-do Step 16 writing to `/workspace/...`. If it's nested (e.g. `/workspace/adapter/<subdir>/adapter_config.json`), move the files up to `/workspace/adapter/` or point `LORA_ADAPTER_PATH` at the subdir. Verify the endpoint has the volume attached (Advanced → Network Volumes) and `LORA_ADAPTER_PATH=/runpod-volume/adapter` |
| RunPod FAILED | Missing adapter files | Attach a temp Pod with the volume (mounts at `/workspace`) and verify `/workspace/adapter/adapter_config.json` exists — it appears at `/runpod-volume/adapter/...` inside the Serverless worker |
| RunPod `502: PEFT inference failed: cannot identify image file` | The decoded base64 isn't a valid image. Usual causes: the request inlined `$(base64 …)` in **single quotes** (so the literal `$(…)` string was sent, not the image), the file is HEIC/PDF/non-image, or a `data:` URI prefix slipped into the base64 | Use the Step 19 `python3` encoder to build the payload (no quoting traps). Confirm `file <image>` reports JPEG/PNG; convert HEIC with `sips -s format jpeg in.heic --out out.jpg` |
| Backend logs `NotFoundException: Cannot POST /telegram/webhook` | The webhook URL is missing the trailing secret segment — the route is `POST /telegram/webhook/:secret`, not `/telegram/webhook` | Re-run Step 12 with the URL ending in `/telegram/webhook/${TELEGRAM_WEBHOOK_SECRET}` |
| Backend logs `NotFoundException: Cannot POST /telegram/webhook/` (trailing slash, **empty** segment) | The webhook was set with an empty secret — a `setWebhook` curl ran with `$TELEGRAM_WEBHOOK_SECRET` unset (`.env` not sourced), producing `/telegram/webhook/` | Re-register with the bundled script: `docker compose -f docker-compose.prod.yml exec backend node dist/src/scripts/setup-telegram-webhook.js` (or source `.env` and verify the secret is non-empty before the curl) |
| `getWebhookInfo` shows `Wrong response from the webhook: 403 Forbidden` (route resolves but is rejected) | `TELEGRAM_WEBHOOK_PATH` isn't set in `.env`, so the auth guard doesn't treat `/telegram/webhook/*` as public and rejects the unauthenticated POST (a Nest guard returning `false` yields **403**, not 401) | Add `TELEGRAM_WEBHOOK_PATH=/telegram/webhook` to `.env`, then `set -a && source .env && set +a` and `docker compose -f docker-compose.prod.yml up -d --force-recreate backend` |
| Backend logs `Invalid Telegram webhook secret token` (401) | The `secret_token` Telegram sends (header) doesn't match `TELEGRAM_WEBHOOK_SECRET` in `.env` | Re-run Step 12 with the correct `secret_token`; ensure `.env` is sourced so both sides use the same value |
| `getWebhookInfo` shows `403 Forbidden`, but a **direct** POST to the backend (`curl http://127.0.0.1:${BACKEND_PORT:-3004}/telegram/webhook/$SECRET` with the secret header) returns `200` | The 403 is injected by the **Cloudflare proxy**, not your app — `getWebhookInfo` shows a `104.21.x.x`/`172.67.x.x` IP, and Cloudflare's Bot Fight Mode/WAF blocks Telegram's POSTs before they reach Caddy | Set the `birr-track-api` record to **DNS-only (grey cloud)** so Telegram hits Caddy directly, then verify `curl -I https://birr-track-api.abenezer-ayalneh.dev/health` is `200`. To keep the proxy instead: disable Bot Fight Mode and add a WAF rule to Skip/Allow path `/telegram/webhook*` |
| Telegram webhook not working | Wrong URL or secret | Re-run the webhook curl from Step 12 with sourced `.env`, then check `getWebhookInfo` |
| Admin Panel blank page | `VITE_API_BASE_URL` not set at build time | Rebuild: `docker compose -f docker-compose.prod.yml up -d --build miniapp` |
| MinIO connection refused | MinIO container not healthy | `docker compose -f docker-compose.prod.yml logs minio` — check `STORAGE_ACCESS_KEY` and `STORAGE_SECRET_KEY` in `.env` |
| `mc`: `S3 API Requests must be made to API port` / bucket `Access Denied` | `mc` hit the console port, or `$STORAGE_*` were empty because the host `.env` wasn't sourced | Use the in-container form in Step 11 (`$MINIO_ROOT_USER`/`$MINIO_ROOT_PASSWORD` against API port 9000) — no host sourcing needed |
| Migration fails: "Cannot find data-source.js" | Wrong path in command | Use `dist/src/database/data-source.js` (with `src/` prefix) |
| Postgres won't start: "password not specified" | `DATABASE_PASSWORD` empty in `.env` | Set it to a non-empty value |
| Backend `ECONNREFUSED <ip>:5433` or `<ip>:6380` | `DATABASE_PORT`/`REDIS_PORT` hold the **external** value | These are **internal** ports: set `DATABASE_PORT=5432`, `REDIS_PORT=6379`. Use `DATABASE_EXTERNAL_PORT`/`REDIS_EXTERNAL_PORT` for the host-published ports. Then `docker compose -f docker-compose.prod.yml up -d --force-recreate backend` |
| Backend `EAI_AGAIN postgres`/`redis` (DNS) | A service is detached from the compose network — `docker ps` shows it `Up` but with an empty network column and no published ports. Happens after a partial single-service `up`/`down` or a Docker daemon restart | Recreate the **whole** stack so Compose reattaches everyone with DNS aliases: `docker compose -f docker-compose.prod.yml up -d --force-recreate`. If needed, `down` (never `-v`) then `up -d`. Prefer full-stack `up` over single-service `--force-recreate <svc>` to avoid this |
| `up` fails: `Bind for 127.0.0.1:<port> failed: port is already allocated` | A `*_EXTERNAL_PORT` points at a host port already taken by another stack on the VPS (this box also runs an `infra` Postgres/Redis on 5432/6379) | Point the external port at a free one: `DATABASE_EXTERNAL_PORT=5433`, `REDIS_EXTERNAL_PORT=6380`. Internal `DATABASE_PORT`/`REDIS_PORT` stay 5432/6379. See occupants with `ss -tlnp \| grep <port>`. **Re-source `.env` after editing** — exported shell vars override the file |

## Rollback

### VPS

```bash
cd /home/birr-track
git log --oneline -5          # find the last good commit
git checkout <commit-hash>
set -a && source .env && set +a
docker compose -f docker-compose.prod.yml up -d --build backend miniapp
```

### RunPod VLM Worker

Tag images before deploying new versions:

```bash
docker tag abenezerayalneh/birr-track-vlm:latest abenezerayalneh/birr-track-vlm:v1
docker push abenezerayalneh/birr-track-vlm:v1
```

To rollback, edit the endpoint's **Container Image** tag: three-dots menu → **Edit Endpoint** → update the image to the known-good tag → **Save Endpoint**. RunPod rolls workers to the new image.

## Estimated Monthly Cost

| Item | Cost |
|------|------|
| VPS (4GB RAM, Ubuntu) | $6–12/mo |
| RunPod Network Volume (15GB) | ~$1/mo |
| RunPod GPU compute (burst) | ~$2–5/mo |
| Domain | Already owned |
| **Total** | **~$10–18/mo** |
