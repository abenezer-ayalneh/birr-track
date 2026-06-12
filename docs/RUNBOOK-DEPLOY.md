# Runbook: Full Deployment

**Owner:** Abenezer Ayalneh | **Frequency:** As needed
**Last Updated:** 2026-06-12 | **Last Run:** —

## Purpose

Deploy Birr Track end-to-end:

- **VPS (Ubuntu 22.04/24.04):** NestJS backend, Vite Mini App, PostgreSQL, Redis, MinIO, Caddy (auto-HTTPS)
- **RunPod Serverless:** Fine-tuned Qwen2.5-VL-3B receipt extraction

Domains:
- API: `birr-track-api.abenezer-ayalneh.dev`
- Mini App: `birr-track-telegram-app.abenezer-ayalneh.dev`

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
**If it fails:** Wait 5–10 minutes for DNS propagation. If using Cloudflare proxy (orange cloud), set it to DNS-only (grey cloud) so Caddy can obtain Let's Encrypt certificates.

---

## Part 3: Clone and Configure

### Step 6: Clone the repo

```bash
ssh deploy@<VPS_IP>
sudo mkdir -p /home/birr-track
sudo chown deploy:deploy /home/birr-track
git clone https://github.com/<your-gh-username>/birr-track.git /home/birr-track
cd /home/birr-track
```

### Step 7: Create production `.env` for the backend

```bash
cat > /home/birr-track/birr-track-backend/.env << 'ENVEOF'
# App
PORT=3000
APP_BASE_URL=https://birr-track-api.abenezer-ayalneh.dev
NODE_ENVIRONMENT=production
CORS_ALLOWED_ORIGINS=https://birr-track-telegram-app.abenezer-ayalneh.dev
FRONTEND_APP_URL=https://birr-track-telegram-app.abenezer-ayalneh.dev

# Throttle
THROTTLER_TTL=60000
THROTTLER_LIMIT=30

# Database (internal Docker network)
DATABASE_USER=postgres
DATABASE_PASSWORD=<GENERATE_A_STRONG_PASSWORD>
DATABASE_HOST=postgres
DATABASE_PORT=5432
DATABASE_NAME=birr_track
DATABASE_URL=postgresql://postgres:<SAME_PASSWORD>@postgres:5432/birr_track?schema=public

# Redis (internal Docker network)
REDIS_HOST=redis
REDIS_PORT=6379

# RunPod VLM Worker
RUNPOD_API_KEY=<YOUR_RUNPOD_API_KEY>
RUNPOD_ENDPOINT_ID=<YOUR_RUNPOD_ENDPOINT_ID>
VLM_REQUEST_TIMEOUT_MS=120000

# Telegram
TELEGRAM_BOT_TOKEN=<YOUR_BOT_TOKEN>
TELEGRAM_WEBHOOK_SECRET=<GENERATE_A_RANDOM_STRING>
TELEGRAM_WEBHOOK_BASE_URL=https://birr-track-api.abenezer-ayalneh.dev
TELEGRAM_PHOTO_RATE_LIMIT=30
TELEGRAM_PHOTO_RATE_WINDOW_SECONDS=60

# MinIO (internal Docker network)
STORAGE_ENDPOINT=http://minio:9000
STORAGE_REGION=us-east-1
STORAGE_BUCKET=birr-track-receipts
STORAGE_ACCESS_KEY=<GENERATE_MINIO_ACCESS_KEY>
STORAGE_SECRET_KEY=<GENERATE_MINIO_SECRET_KEY>
STORAGE_FORCE_PATH_STYLE=true
ENVEOF
```

Replace every `<...>` placeholder. Generate passwords with:

```bash
openssl rand -hex 24
```

### Step 8: Create `.env` for the Mini App

```bash
cat > /home/birr-track/birr-track-miniapp/.env << 'ENVEOF'
VITE_API_BASE_URL=https://birr-track-api.abenezer-ayalneh.dev
VITE_BOT_USERNAME=<YOUR_BOT_USERNAME>
ENVEOF
```

---

## Part 4: Docker Compose (Production)

### Step 9: Verify deployment files

These files are already committed in the repo — verify they exist after cloning:

```bash
ls -la /home/birr-track/docker-compose.prod.yml
ls -la /home/birr-track/birr-track-backend/Dockerfile
ls -la /home/birr-track/birr-track-miniapp/Dockerfile
ls -la /home/birr-track/caddy/Caddyfile
```

**Expected result:** All four files exist.

| File | Purpose |
|------|---------|
| `docker-compose.prod.yml` | Orchestrates app services (Postgres, Redis, MinIO, backend, miniapp) |
| `birr-track-backend/Dockerfile` | Multi-stage Node 20 build → production image |
| `birr-track-miniapp/Dockerfile` | Multi-stage Vite build → Nginx static serving |
| `caddy/Caddyfile` | Reverse proxy config for both subdomains (imported into host Caddy) |

### Step 10: Import the Caddyfile into host Caddy

Caddy is already running on the VPS and serving other sites. Import this project's config into the existing Caddyfile:

```bash
# Add an import line to the host Caddyfile
echo 'import /home/birr-track/caddy/Caddyfile' | sudo tee -a /etc/caddy/Caddyfile

# Verify the config is valid
sudo caddy validate --config /etc/caddy/Caddyfile

# Reload Caddy
sudo systemctl reload caddy
```

**Expected result:** `caddy validate` reports no errors. After reload, Caddy serves both new subdomains alongside existing sites.
**If it fails:** Check that the import path is correct and there are no duplicate site addresses across your Caddyfiles.

---

## Part 6: First Deploy on VPS

### Step 16: Start everything

```bash
cd /home/birr-track

# Source the backend .env for Compose variable interpolation
set -a && source birr-track-backend/.env && set +a

docker compose -f docker-compose.prod.yml up -d --build
```

**Expected result:** All containers running: `docker compose -f docker-compose.prod.yml ps` shows all healthy.

### Step 17: Run database migrations

```bash
docker compose -f docker-compose.prod.yml exec backend node -e "
  const { execSync } = require('child_process');
  execSync('npx prisma migrate deploy', { stdio: 'inherit', cwd: '/app' });
"
```

Or enter the container:

```bash
docker compose -f docker-compose.prod.yml exec backend sh
npx prisma migrate deploy
exit
```

**Expected result:** Migrations applied successfully.
**If it fails:** Check `DATABASE_URL` in `.env` matches the `postgres` service name.

### Step 18: Create the MinIO bucket

```bash
docker compose -f docker-compose.prod.yml exec minio mc alias set local http://localhost:9000 <STORAGE_ACCESS_KEY> <STORAGE_SECRET_KEY>
docker compose -f docker-compose.prod.yml exec minio mc mb local/birr-track-receipts --ignore-existing
```

### Step 19: Set up the Telegram webhook

```bash
docker compose -f docker-compose.prod.yml exec backend node dist/scripts/setup-telegram-webhook.js
```

Or manually:

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://birr-track-api.abenezer-ayalneh.dev/telegram/webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"
  }'
```

**Expected result:** `{"ok":true,"result":true,"description":"Webhook was set"}`

### Step 20: Verify

```bash
# Backend health
curl https://birr-track-api.abenezer-ayalneh.dev/health

# Mini App loads
curl -sI https://birr-track-telegram-app.abenezer-ayalneh.dev | head -5
```

**Expected result:** Backend returns JSON health response; Mini App returns `200 OK`.

---

## Part 7: RunPod VLM Worker Setup

### Step 21: Build and push the VLM Docker image

On your local machine:

```bash
cd vlm-inference

docker build --platform linux/amd64 -t abenezerayalneh/birr-track-vlm:latest .

docker push abenezerayalneh/birr-track-vlm:latest
```

**Expected result:** Image pushed to Docker Hub.
**If it fails:** `docker login` first.

### Step 22: Create a RunPod Network Volume

1. Log in to [runpod.io](https://runpod.io)
2. Go to **Storage** → **Network Volumes**
3. Create a volume:
   - **Name:** `birr-track-models`
   - **Size:** 15 GB
   - **Region:** Pick the cheapest GPU region (e.g. EU-RO-1 or US-TX-3)
4. Note the volume ID

### Step 23: Download model weights to the Network Volume

Create a temporary GPU Pod with the network volume attached:

1. Go to **Pods** → **Deploy**
2. Pick any cheap GPU (e.g. RTX 3090, Community Cloud)
3. Under **Network Volume**, attach `birr-track-models` at `/runpod-volume`
4. Use template: `pytorch/pytorch:2.4.1-cuda12.1-cudnn9-runtime`
5. Start the pod, SSH in, then run:

```bash
pip install huggingface_hub[cli]

# Download base model to the HF cache on the volume
HF_HOME=/runpod-volume/hf-cache huggingface-cli download Qwen/Qwen2.5-VL-3B-Instruct

# Copy your LoRA adapter
mkdir -p /runpod-volume/adapter
# Upload qwen25vl-3b-birrtrack-lora.zip via runpodctl or SCP
cd /runpod-volume/adapter
unzip /tmp/qwen25vl-3b-birrtrack-lora.zip
# Verify adapter_config.json exists:
ls /runpod-volume/adapter/
```

**Expected result:** `/runpod-volume/hf-cache` has the base model, `/runpod-volume/adapter` has `adapter_config.json` + `adapter_model.safetensors`.

6. **Stop and delete the temporary pod** (the network volume persists).

### Step 24: Create the Serverless Endpoint

1. Go to **Serverless** → **Endpoints** → **New Endpoint**
2. Configure:
   - **Name:** `birr-track-vlm`
   - **Docker Image:** `abenezerayalneh/birr-track-vlm:latest`
   - **GPU:** RTX 3080 or RTX 3090 (cheapest option, ~$0.20–0.40/hr)
   - **Network Volume:** `birr-track-models` mounted at `/runpod-volume`
   - **Min Workers:** 0 (scale to zero when idle)
   - **Max Workers:** 1
   - **Idle Timeout:** 5 seconds (scales down fast)
   - **Execution Timeout:** 120 seconds
   - **Environment Variables:**
     - `HF_HOME=/runpod-volume/hf-cache`
     - `LORA_ADAPTER_PATH=/runpod-volume/adapter`
     - `VLM_BACKEND=peft`
     - `HF_BASE_MODEL=Qwen/Qwen2.5-VL-3B-Instruct`
3. Click **Create**
4. Note the **Endpoint ID** from the URL (e.g. `abc123def456`)

### Step 25: Get your API key

1. Go to **Settings** → **API Keys**
2. Create a new key or copy existing
3. Update your VPS backend `.env`:

```bash
ssh deploy@<VPS_IP>
cd /home/birr-track
# Edit birr-track-backend/.env:
# RUNPOD_API_KEY=rpa_XXXXXXXXXXXX
# RUNPOD_ENDPOINT_ID=abc123def456

# Restart backend
set -a && source birr-track-backend/.env && set +a
docker compose -f docker-compose.prod.yml up -d --build backend
```

### Step 26: Test the VLM Worker

```bash
# Direct RunPod test
curl -X POST "https://api.runpod.ai/v2/<ENDPOINT_ID>/runsync" \
  -H "Authorization: Bearer <RUNPOD_API_KEY>" \
  -H "Content-Type: application/json" \
  -d "{\"input\": {\"image_base64\": \"$(base64 -w0 /path/to/test-receipt.jpg)\"}}"
```

**Expected result:** JSON with `status: "COMPLETED"` and `output: { bankName, amount, ... }`.
**If it fails:** Check `docker compose -f docker-compose.prod.yml logs` on RunPod dashboard → Endpoint → Logs.

---

## Part 8: GitHub Actions CI/CD

### Step 27: Add secrets to GitHub

Go to your repo → Settings → Secrets and variables → Actions. Add:

| Secret                   | Value                                |
|--------------------------|--------------------------------------|
| `VPS_HOST`               | Your VPS IP                          |
| `VPS_USER`               | `deploy`                             |
| `VPS_SSH_KEY`            | Private SSH key for `deploy` user    |
| `DOCKERHUB_USERNAME`     | `abenezerayalneh`                    |
| `DOCKERHUB_TOKEN`        | Docker Hub access token              |
| `RUNPOD_API_KEY`         | RunPod API key (for VLM image push)  |

### Step 28: Create the deploy workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-vlm:
    runs-on: ubuntu-latest
    if: contains(github.event.head_commit.message, '[vlm]') || contains(github.event.head_commit.modified, 'vlm-inference/')
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: ./vlm-inference
          push: true
          tags: abenezerayalneh/birr-track-vlm:latest
          platforms: linux/amd64

  deploy-vps:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /home/birr-track
            git pull origin main
            set -a && source birr-track-backend/.env && set +a
            docker compose -f docker-compose.prod.yml up -d --build backend miniapp
            docker compose -f docker-compose.prod.yml exec -T backend npx prisma migrate deploy
```

---

## Verification

- [ ] `curl https://birr-track-api.abenezer-ayalneh.dev/health` returns OK
- [ ] `curl https://birr-track-telegram-app.abenezer-ayalneh.dev` returns HTML
- [ ] Send a receipt image to the Telegram bot → Transaction is created
- [ ] RunPod dashboard shows the endpoint received a request
- [ ] `docker compose -f docker-compose.prod.yml ps` shows all containers healthy

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Caddy 502 Bad Gateway | Backend container not running or port not exposed | `docker compose -f docker-compose.prod.yml logs backend` and verify `ss -tlnp | grep 3000` |
| Caddy TLS error | DNS not pointing to VPS / port 80 or 443 blocked | Check `dig` output, `ufw status`, and `journalctl -u caddy` |
| RunPod TIMEOUT | Model not loaded / wrong volume mount | Check endpoint logs in RunPod dashboard |
| RunPod FAILED | Missing adapter files | SSH into a temp pod, verify `/runpod-volume/adapter/adapter_config.json` exists |
| Telegram webhook not working | Wrong URL or secret | Re-run webhook setup script |
| Mini App blank page | `VITE_API_BASE_URL` not set at build time | Rebuild miniapp container with correct `.env` |
| MinIO connection refused | MinIO container not healthy | `docker compose logs minio`, check access/secret keys |

## Rollback

### VPS

```bash
cd /home/birr-track
git log --oneline -5          # find the last good commit
git checkout <commit-hash>
docker compose -f docker-compose.prod.yml up -d --build backend miniapp
```

### RunPod VLM

Tag images before deploying new versions:

```bash
docker tag abenezerayalneh/birr-track-vlm:latest abenezerayalneh/birr-track-vlm:v1
docker push abenezerayalneh/birr-track-vlm:v1
```

To rollback, update the endpoint's Docker image tag in the RunPod dashboard.

## Estimated Monthly Cost

| Item | Cost |
|------|------|
| VPS (4GB RAM, Ubuntu) | $6–12/mo |
| RunPod Network Volume (15GB) | ~$1/mo |
| RunPod GPU compute (burst) | ~$2–5/mo |
| Domain | Already owned |
| **Total** | **~$10–18/mo** |
