import json
import re
from typing import Any, Dict, Optional

from fastapi import HTTPException

from .mapper import map_raw_to_response
from .schemas import ExtractResponse

_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)\s*```", re.IGNORECASE)
_JSON_OBJECT_RE = re.compile(r"\{[\s\S]*\}")


def parse_model_output(text: str) -> ExtractResponse:
    raw = extract_json_object(text)
    if raw is None:
        raise HTTPException(
            status_code=422,
            detail="Model response did not contain valid JSON",
        )
    try:
        return map_raw_to_response(raw)
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"JSON failed validation: {exc}",
        ) from exc


def extract_json_object(text: str) -> Optional[Dict[str, Any]]:
    stripped = text.strip()
    if not stripped:
        return None

    candidates = [stripped]
    for match in _JSON_FENCE_RE.finditer(stripped):
        candidates.append(match.group(1).strip())

    object_match = _JSON_OBJECT_RE.search(stripped)
    if object_match:
        candidates.append(object_match.group(0))

    for candidate in candidates:
        parsed = try_parse_json(candidate)
        if isinstance(parsed, dict):
            return parsed

    return None


def try_parse_json(text: str) -> Any:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None
