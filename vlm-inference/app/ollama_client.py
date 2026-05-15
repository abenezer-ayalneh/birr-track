import base64
import io
import logging

import httpx
from fastapi import HTTPException
from PIL import Image

from .config import get_extract_prompt, get_ollama_host, get_ollama_model, get_request_timeout_ms
from .parse import parse_model_output
from .schemas import ExtractResponse

logger = logging.getLogger(__name__)

MAX_IMAGE_EDGE_PX = 1280


def encode_image_for_ollama(image_bytes: bytes) -> str:
    """Resize large images and return base64 JPEG for Ollama vision API."""
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
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=85)
        return base64.b64encode(buffer.getvalue()).decode("ascii")


async def check_ollama_health() -> tuple[bool, bool]:
    """Returns (ollama_reachable, model_available)."""
    host = get_ollama_host()
    model = get_ollama_model()
    timeout = httpx.Timeout(5.0)

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(f"{host}/api/tags")
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPError, ValueError):
        return False, False

    models = data.get("models") or []
    names = {m.get("name", "") for m in models}
    model_available = model in names or any(
        name == model or name.startswith(f"{model}:") or model.startswith(f"{name}:")
        for name in names
    )
    return True, model_available


async def extract_from_image(image_bytes: bytes) -> ExtractResponse:
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image file")

    host = get_ollama_host()
    model = get_ollama_model()
    prompt = get_extract_prompt()
    timeout_sec = get_request_timeout_ms() / 1000.0

    try:
        image_b64 = encode_image_for_ollama(image_bytes)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image: {exc}") from exc

    payload = {
        "model": model,
        "stream": False,
        "format": "json",
        "messages": [
            {
                "role": "user",
                "content": prompt,
                "images": [image_b64],
            }
        ],
        "options": {"temperature": 0},
    }

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(timeout_sec)) as client:
            response = await client.post(f"{host}/api/chat", json=payload)
            response.raise_for_status()
            data = response.json()
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=504,
            detail=f"Ollama request timed out after {timeout_sec}s",
        ) from exc
    except httpx.HTTPStatusError as exc:
        logger.error("Ollama HTTP error: %s", exc.response.text)
        raise HTTPException(
            status_code=502,
            detail=f"Ollama returned {exc.response.status_code}",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to reach Ollama at {host}",
        ) from exc

    message = data.get("message") or {}
    content = message.get("content", "")
    if not isinstance(content, str) or not content.strip():
        raise HTTPException(status_code=502, detail="Ollama returned empty content")

    return parse_model_output(content)
