# ADR 0004: Host VLM Worker on RunPod Serverless

**Status**: Accepted  
**Date**: 2026-06-12

## Context

The backend needs to call a fine-tuned Qwen2.5-VL-3B-Instruct + LoRA adapter for Receipt extraction. The model requires a GPU for usable inference speed (~2–10s/image). Traffic is bursty (business hours only), so an always-on GPU is wasteful.

## Decision

Deploy the VLM Worker as a **RunPod serverless endpoint** backed by a **RunPod Network Volume** storing the model weights.

- A Docker image contains the inference code (adapted from `vlm-inference/app/hf_client.py`) wrapped in a RunPod handler.
- The base model (`Qwen/Qwen2.5-VL-3B-Instruct`, ~7GB) and LoRA adapter (~100MB) are downloaded once onto a Network Volume; the container mounts it at cold start.
- The backend sends `POST /v2/{endpoint_id}/runsync` with `{"input": {"image_base64": "..."}}` and receives structured Transaction fields.

## Alternatives Considered

- **RunPod Pod (always-on)**: Keeps the existing FastAPI `/extract` multipart interface unchanged, but pays ~$0.20–0.40/hr even when idle.
- **Modal.com**: Similar cost and DX, but Docker was preferred for familiarity.
- **HuggingFace Inference Endpoints**: Managed but expensive for custom VLM models.
- **Self-host on VPS**: CPU-only VPS inference would be 30–120s/image — too slow.

## Consequences

- `vlm.service.ts` must base64-encode the Receipt image and speak RunPod's API (not multipart `/extract`).
- Cold start is ~15–30s (model on Network Volume, not downloaded from scratch).
- Cost is ~$0 when idle; ~$0.20–0.40/hr only during active inference.
- `RUNPOD_API_KEY` and `RUNPOD_ENDPOINT_ID` are required backend env vars.
