"""RunPod serverless handler for Birr Track VLM receipt extraction."""

from __future__ import annotations

import base64
import logging

import runpod

from app.hf_client import extract_from_image_sync, load_peft_model

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

logger.info("Loading PEFT model at worker startup…")
load_peft_model()
logger.info("PEFT model ready.")


def handler(job: dict) -> dict:
    job_input = job.get("input", {})

    image_b64 = job_input.get("image_base64")
    if not image_b64:
        return {"error": "Missing required field: image_base64"}

    try:
        image_bytes = base64.b64decode(image_b64)
    except Exception as exc:
        return {"error": f"Invalid base64: {exc}"}

    try:
        result = extract_from_image_sync(image_bytes)
        return result.model_dump()
    except Exception as exc:
        logger.exception("Inference failed")
        return {"error": str(exc)}


runpod.serverless.start({"handler": handler})
