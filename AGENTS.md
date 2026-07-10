# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Structure

This is a monorepo for Birr Track, an Ethiopian receipt tracking application with VLM (Vision Language Model) receipt extraction capabilities. The project consists of three main components:

- **`birr-track-backend/`** - NestJS backend with Telegram bot integration, PostgreSQL/Redis, and receipt processing
- **`vlm-inference/`** - FastAPI microservice for receipt extraction using Qwen2.5-VL via Ollama or fine-tuned models
- **`qwen-vlm-training/`** - Training scripts and dataset preparation for fine-tuning Qwen2.5-VL on Ethiopian receipt data

## Common Development Commands

### Backend (NestJS)
Navigate to `birr-track-backend/` and use these commands:

- **Development**: `pnpm run start:dev`
- **Build**: `pnpm run build`
- **Lint**: `pnpm run lint` (auto-fixes issues)
- **Format**: `pnpm run format`
- **Test**: `pnpm run test`
- **Test (watch)**: `pnpm run test:watch`
- **Test (coverage)**: `pnpm run test:cov`
- **E2E Tests**: `pnpm run test:e2e`
- **Database Migration**: `pnpm run db:migrate`
- **Smoke Test**: `pnpm run smoke:e2e` or `pnpm run smoke:e2e:wait`
- **Setup + Smoke**: `pnpm run smoke:e2e:setup`

### VLM Inference Service (FastAPI)
Navigate to `vlm-inference/` and use these commands:

- **Setup**: `python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
- **Run**: `uvicorn app.main:app --host 0.0.0.0 --port 8000`
- **Test**: `python -m pytest tests/`

### Training Pipeline
Navigate to `qwen-vlm-training/` for dataset preparation and model training:

- **Setup**: `python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
- **Prepare Dataset**: `python prepare_dataset.py`
- **Package for Kaggle**: `python package_kaggle_dataset.py`

## Development Setup Order

For local development, services should be started in this order:

1. **Infrastructure**: `cd birr-track-backend && docker compose up -d` (PostgreSQL + Redis)
2. **Ollama**: `ollama serve` and `ollama pull qwen2.5vl`
3. **VLM Service**: `cd vlm-inference && uvicorn app.main:app --host 0.0.0.0 --port 8000`
4. **Backend**: `cd birr-track-backend && pnpm run start:dev`

## Architecture Overview

### Receipt Processing Flow
1. Telegram bot receives receipt image
2. Backend forwards image to VLM inference service (`POST /extract`)
3. VLM service processes via Ollama (Qwen2.5-VL) or fine-tuned PEFT model
4. Extracted data (bankName, amount, transactionId, timestamp, currency, confidence) returned to backend
5. Backend stores transaction in PostgreSQL

### VLM Service Backends
- **Ollama**: Default backend using `qwen2.5vl` model
- **PEFT**: Fine-tuned adapter loaded via Hugging Face transformers
- Backend configurable via environment variables

### Training Pipeline
- Uses `documents/labeled-data.csv` and `documents/receipts/` images
- Converts to LLaMA-Factory sharegpt-vision format
- Supports LoRA fine-tuning on Ethiopian receipt patterns
- Outputs train/validation splits for model training

## Key Environment Variables

### Backend
- `VLM_SERVICE_URL`: URL for VLM inference service (default: `http://localhost:8000`)
- Database and Redis connection variables
- Telegram bot configuration

### VLM Inference
- `VLM_BACKEND`: `ollama` or `peft`
- `OLLAMA_MODEL`: Model name for Ollama (default: `qwen2.5vl`)
- `LORA_ADAPTER_PATH`: Path to fine-tuned adapter (PEFT mode)
- `HF_BASE_MODEL`: Base model for PEFT loading