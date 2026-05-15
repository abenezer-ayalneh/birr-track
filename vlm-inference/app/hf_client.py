"""Hugging Face + PEFT inference for fine-tuned Qwen2.5-VL receipt extraction."""

from __future__ import annotations

import asyncio
import io
import logging
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import HTTPException
from PIL import Image

from .config import (
    get_hf_base_model,
    get_hf_device,
    get_lora_adapter_path,
    get_peft_extract_prompt,
)
from .parse import parse_model_output
from .schemas import ExtractResponse

logger = logging.getLogger(__name__)

MAX_IMAGE_EDGE_PX = 1280

_model = None
_processor = None
_device: Optional[str] = None
_loaded = False


def _resolve_device() -> str:
    import torch

    override = get_hf_device()
    if override:
        return override
    if torch.cuda.is_available():
        return "cuda:0"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def _save_resized_jpeg(image_bytes: bytes) -> Path:
    with Image.open(io.BytesIO(image_bytes)) as img:
        img = img.convert("RGB")
        width, height = img.size
        longest = max(width, height)
        if longest > MAX_IMAGE_EDGE_PX:
            scale = MAX_IMAGE_EDGE_PX / longest
            img = img.resize(
                (int(width * scale), int(height * scale)),
                Image.Resampling.LANCZOS,
            )
        tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
        img.save(tmp.name, format="JPEG", quality=85)
        return Path(tmp.name)


def load_peft_model() -> None:
    """Load base Qwen2.5-VL + LoRA adapter once at startup."""
    global _model, _processor, _device, _loaded

    if _loaded:
        return

    adapter_path = get_lora_adapter_path()
    if adapter_path is None:
        raise RuntimeError("LORA_ADAPTER_PATH is not set or does not exist")

    base_model = get_hf_base_model()
    _device = _resolve_device()

    import torch
    from peft import PeftModel
    from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration

    logger.info(
        "Loading PEFT model base=%s adapter=%s device=%s",
        base_model,
        adapter_path,
        _device,
    )

    _processor = AutoProcessor.from_pretrained(base_model, trust_remote_code=True)
    use_fp16 = _device.startswith("cuda")
    dtype = torch.float16 if use_fp16 else torch.float32
    base = Qwen2_5_VLForConditionalGeneration.from_pretrained(
        base_model,
        torch_dtype=dtype,
        device_map={"": _device},
        trust_remote_code=True,
        low_cpu_mem_usage=True,
    )
    _model = PeftModel.from_pretrained(base, str(adapter_path))
    _model.eval()
    _loaded = True
    logger.info("PEFT model loaded on %s", _device)


def is_peft_loaded() -> bool:
    return _loaded


def get_peft_device() -> str:
    return _device or "unknown"


def _generate_sync(image_path: Path) -> str:
    import torch
    from qwen_vl_utils import process_vision_info

    if _model is None or _processor is None or _device is None:
        raise RuntimeError("PEFT model not loaded")

    prompt = get_peft_extract_prompt()
    user_text = prompt.replace("<image>", "").strip()
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": str(image_path.resolve())},
                {"type": "text", "text": user_text},
            ],
        }
    ]
    text_prompt = _processor.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )
    image_inputs, video_inputs = process_vision_info(messages)
    inputs = _processor(
        text=[text_prompt],
        images=image_inputs,
        videos=video_inputs,
        padding=True,
        return_tensors="pt",
    ).to(_device)

    pad_token_id = _processor.tokenizer.pad_token_id or _processor.tokenizer.eos_token_id

    with torch.inference_mode():
        output_ids = _model.generate(
            **inputs,
            max_new_tokens=256,
            do_sample=False,
            pad_token_id=pad_token_id,
        )

    input_lengths = inputs.input_ids.shape[1]
    return _processor.batch_decode(
        output_ids[:, input_lengths:].cpu(), skip_special_tokens=True
    )[0]


def extract_from_image_sync(image_bytes: bytes) -> ExtractResponse:
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image file")
    if not _loaded:
        raise HTTPException(status_code=503, detail="PEFT model is not loaded")

    image_path: Optional[Path] = None
    try:
        image_path = _save_resized_jpeg(image_bytes)
        raw = _generate_sync(image_path)
        return parse_model_output(raw)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("PEFT inference failed")
        raise HTTPException(status_code=502, detail=f"PEFT inference failed: {exc}") from exc
    finally:
        if image_path is not None:
            try:
                image_path.unlink(missing_ok=True)
            except OSError:
                pass


async def extract_from_image(image_bytes: bytes) -> ExtractResponse:
    return await asyncio.to_thread(extract_from_image_sync, image_bytes)
