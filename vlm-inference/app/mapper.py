from typing import Any, Dict

from .schemas import ExtractResponse

# Training dataset keys (prepare_dataset.py) -> Nest API keys
TRAINING_KEY_MAP: Dict[str, str] = {
    "bank": "bankName",
    "date": "timestamp",
    "txn_id": "transactionId",
}


def map_raw_to_response(raw: Dict[str, Any]) -> ExtractResponse:
    """Normalize model JSON (API keys or training keys) to Nest contract."""
    normalized: Dict[str, Any] = {}

    for key, value in raw.items():
        if not isinstance(key, str):
            continue
        target = TRAINING_KEY_MAP.get(key, key)
        normalized[target] = value

    amount = normalized.get("amount")
    if isinstance(amount, str) and amount.strip():
        cleaned = amount.replace(",", "").strip()
        try:
            normalized["amount"] = float(cleaned)
        except ValueError:
            normalized["amount"] = None

    return ExtractResponse.model_validate(normalized)
