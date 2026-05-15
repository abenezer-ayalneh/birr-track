# VLM Inference Service

FastAPI service that implements `POST /extract` for the NestJS backend. Supports two backends:

| Backend | Env | Description |
| --- | --- | --- |
| **ollama** (default) | `VLM_BACKEND=ollama` | Local Ollama `qwen2.5vl` — no fine-tuning required |
| **peft** | `VLM_BACKEND=peft` | Hugging Face `Qwen2.5-VL-3B` + your LoRA adapter from Kaggle training |

## Ollama setup (default)

### Prerequisites

1. [Ollama](https://ollama.com) running (`ollama serve`)
2. `ollama pull qwen2.5vl`

```bash
cd vlm-inference
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## PEFT setup (fine-tuned adapter)

After training on Kaggle (see [`../qwen-vlm-training/README.md`](../qwen-vlm-training/README.md)):

```bash
cd vlm-inference
unzip ~/Downloads/qwen25vl-3b-birrtrack-lora.zip -d adapters/qwen25vl-3b-birrtrack-lora
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-peft.txt
cp .env.example .env
# Edit .env: VLM_BACKEND=peft
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

First startup downloads the base model from Hugging Face (~6 GB) and loads the adapter. Use a CUDA GPU for reasonable latency; MPS on Mac works but is slow.

## API

- `GET /health` — backend status (`ollama` or `peft`)
- `POST /extract` — multipart field `file` (receipt image)

```bash
curl -F "file=@../documents/receipts/cbe_screenshot_1.jpg" http://localhost:8000/extract
```

## Environment

| Variable | Default | Description |
| --- | --- | --- |
| `VLM_BACKEND` | `ollama` | `ollama` or `peft` |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama API (ollama backend) |
| `OLLAMA_MODEL` | `qwen2.5vl:latest` | Ollama model tag |
| `HF_BASE_MODEL` | `Qwen/Qwen2.5-VL-3B-Instruct` | Base model (peft backend) |
| `LORA_ADAPTER_PATH` | `./adapters/qwen25vl-3b-birrtrack-lora` | LoRA adapter directory |
| `HF_DEVICE` | _(auto)_ | `cuda:0`, `mps`, or `cpu` |
| `VLM_REQUEST_TIMEOUT_MS` | `120000` | Ollama timeout (ms) |

Prompts:

- Ollama: [`prompts/receipt_extract.txt`](prompts/receipt_extract.txt) (Nest API field names)
- PEFT: [`prompts/receipt_extract_training.txt`](prompts/receipt_extract_training.txt) (training keys; mapped via `mapper.py`)

## Response contract

```json
{
  "bankName": "Commercial Bank of Ethiopia",
  "amount": 25000.0,
  "transactionId": "FT26094X0XVY",
  "timestamp": "2026-04-04T00:00:00.000Z",
  "currency": "ETB",
  "confidence": 0.85
}
```

Training-key aliases (`bank`, `date`, `txn_id`) are mapped automatically.

## Local dev stack

1. Postgres + Redis (`docker compose up -d` in `birr-track-backend`)
2. This service on port 8000
3. NestJS with `VLM_SERVICE_URL=http://localhost:8000` and `VLM_REQUEST_TIMEOUT_MS=120000`

For Ollama, also run `ollama serve` and pull `qwen2.5vl`.
