# NestJS Template

This is a simple Nest.js starter template with some common configured items.

## VLM Microservice (Qwen2.5-VL via Ollama)

Receipt extraction goes through a local Python inference service that calls Ollama (Qwen2.5-VL). The NestJS backend calls `POST ${VLM_SERVICE_URL}/extract` with the receipt image (multipart `file`) and expects a JSON body `{ bankName, amount, transactionId, timestamp, currency, confidence }`.

- Inference service: [`../vlm-inference/`](../vlm-inference/)
- Training scaffold (optional LoRA fine-tune): [`../qwen-vlm-training/`](../qwen-vlm-training/)
- Default `VLM_SERVICE_URL`: `http://localhost:8000`

### Run order (local dev)

1. **Postgres + Redis** — `docker compose up -d` (in this directory)
2. **Ollama** — `ollama serve` and `ollama pull qwen2.5vl`
3. **VLM inference** — see [`../vlm-inference/README.md`](../vlm-inference/README.md):

   ```bash
   cd ../vlm-inference
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```

4. **NestJS** — `pnpm run start:dev` with `VLM_SERVICE_URL=http://localhost:8000`

### Configured items

- Prettier
- EsLint
- Commit-lint
- Winston(logging)
- Global exception filter
- Helmet
- Throttler
- CORS with allowed origins
- Swagger documentation
- Husky(with commit lint and pretty quick)

## Smoke E2E test

Run the backend server and then execute the smoke E2E script.

1. Copy `.env.example` to `.env` if needed.
2. Set `SMOKE_TELEGRAM_FILE_ID` in `.env`.
3. Optionally set:
    - `SMOKE_APP_BASE_URL` (defaults to `APP_BASE_URL` or `http://127.0.0.1:${PORT}`)
    - `SMOKE_WAIT_FOR_BACKEND_MS` (how long to wait for `/health`)
    - `SMOKE_TIMEOUT_MS` (overall smoke test timeout)
4. Run:

```bash
pnpm run smoke:e2e
```

If you start the server in parallel, use:

```bash
pnpm run smoke:e2e:wait
```

Equivalent npm scripts are also available: `npm run test:smoke:e2e` and `npm run test:smoke:e2e:wait`.

If `/transactions` returns `500` during smoke test, run DB migrations first:

```bash
pnpm run db:migrate
```

For a one-command setup + smoke run:

```bash
pnpm run smoke:e2e:setup
```
