# Transaction Receipt Processing System

## Overview

This project is a backend-driven system that automates the extraction and management of payment transaction data from receipt images.

It is designed for businesses (restaurants, hotels, shops) where employees send mobile payment receipts via Telegram. The system processes these images, extracts structured data, and provides managers with a clear dashboard of transactions.

---

## Core Features

- Telegram-based image ingestion
- VLM-based structured data extraction (single call, no separate OCR step)
- Duplicate transaction detection
- Real-time transaction dashboard (via API + WebSocket)
- Manual correction with audit logging
- Export to Excel

---

## System Architecture

The system is composed of two services:

### 1. Backend API (NestJS)

Handles:
- Telegram bot integration
- Job queue processing
- Business logic
- Database interactions
- WebSocket updates
- HTTP calls to the VLM service

---

### 2. VLM Service (Qwen2.5-VL-3B-Instruct, fine-tuned)

Handles:
- Receipt image understanding via a single vision-language model
- Returns structured JSON: `amount`, `bank`, `currency`, `date`, `txn_id` (mapped to NestJS field names: `bankName`, `amount`, `transactionId`, `timestamp`, `currency`)
- Includes a `confidence` score

The training scaffold for this model lives in `qwen-vlm-training/`. A production inference service (FastAPI on GPU) is a follow-up deliverable.

---

## Data Flow

1. Waiter sends receipt image to Telegram group
2. Telegram bot receives image
3. Backend enqueues processing job
4. VLM service extracts structured fields in one call
5. Duplicate detection runs
6. Transaction is saved
7. WebSocket emits real-time update
8. Manager views data via dashboard

See `DATA_FLOW.md` for the full step-by-step wiring.

---

## Tech Stack

### Backend
- Node.js
- NestJS
- PostgreSQL
- Redis (BullMQ)

### VLM Service
- Python
- FastAPI (planned)
- Qwen2.5-VL-3B-Instruct (fine-tuned with LoRA via LLaMA-Factory on Kaggle)
- PEFT for adapter loading

---

## Project Structure

- `/birr-track-backend` — NestJS API
- `/qwen-vlm-training` — Dataset prep + Kaggle notebook for fine-tuning Qwen2.5-VL
- `/documents/receipts` — Labeled receipt images (training data)
- `/documents/labeled-data.csv` — Ground-truth labels for training

---

## Data Model (Core Entity)

### Transaction

| Field            | Description                              |
|------------------|------------------------------------------|
| id               | Unique identifier                        |
| telegramUserId   | Sender ID from Telegram                  |
| telegramName     | Sender display name                      |
| amount           | Transaction amount                       |
| transactionId    | Payment reference                        |
| timestamp        | Transaction date/time (ISO 8601)         |
| bankName         | Payment provider                         |
| confidence       | VLM extraction confidence score (0..1)   |
| isDuplicate      | Duplicate flag                           |
| imageUrl         | Stored image reference                   |
| createdAt        | Record creation time                     |

---

## Extraction Strategy

Single VLM call. The model takes the raw receipt image and emits a structured JSON object with all required fields. Missing fields are returned as `null` and the row is skipped before persistence if any of `amount`, `transactionId`, `timestamp`, or `bankName` is `null`.

This replaces an earlier three-stage pipeline (PaddleOCR → regex parser → fallback LLM) with one model that is fine-tuned end-to-end on the same fields the database stores.

---

## Confidence Scoring

The VLM service returns a single `confidence` value derived from the average per-token log-probability of the generated JSON. NestJS persists it verbatim. Suggested thresholds for downstream tooling:

| Range       | Interpretation                          |
|-------------|-----------------------------------------|
| 0.85 - 1.00 | High — accept without review            |
| 0.60 - 0.85 | Medium — surface for optional review    |
| < 0.60      | Low — manual review recommended         |

---

## Duplicate Detection

A transaction is considered duplicate if: `transaction_id + amount + timestamp` match an existing record.

Duplicates are **not deleted**, only flagged.

---

## API Endpoints

### GET /transactions
- Paginated list
- Filters: date range, waiter (telegram user)

### GET /transactions/summary
Returns: totalRevenue, transactionCount

### PATCH /transactions/:id
- Update extracted fields
- Logs changes in audit table

### GET /transactions/export
- Returns Excel file of filtered data

---

## WebSocket Events

### `transaction:new`
Triggered when a new transaction is processed.

---

## Constraints

- Inference requires GPU (Qwen2.5-VL-3B can run on consumer GPUs in fp16)
- No external API dependency for inference once the VLM service is self-hosted
- Real-time processing target: ~2-4 seconds per image (network + inference)

---

## MVP Scope

Included:
- Telegram ingestion
- VLM extraction pipeline
- Dashboard APIs
- Duplicate detection
- Manual edits
- Export
- LoRA fine-tuning scaffold on Kaggle

Excluded (future work):
- Production-grade VLM inference service deployment
- WhatsApp integration
- Advanced analytics
- Fraud detection

---

## Development Guidelines

- Follow modular architecture (NestJS modules)
- Use DTOs and validation
- Keep the VLM service stateless and isolated from the NestJS process
- Avoid heavy processing in request thread (use queues)
- Prioritize stability over optimization

---

## Future Improvements

- Production VLM inference service (FastAPI on a GPU host)
- WhatsApp integration
- Fraud detection / anomaly detection
- Multi-branch analytics
- Iterative dataset expansion and re-training as new receipt formats appear

---

## Goal

The system should reliably:

1. Accept receipt images from Telegram
2. Extract structured transaction data via a single VLM call
3. Store and display results in real time
4. Allow corrections and auditing

---

## Notes for AI Agents

- Extraction is a single VLM call — do not reintroduce a regex/parser stage unless the schema fundamentally changes
- Do not introduce unnecessary dependencies
- Do not redesign architecture without explicit instruction
- Keep all processing asynchronous via queue
- Ensure all VLM outputs are deterministic JSON matching the documented schema

---
