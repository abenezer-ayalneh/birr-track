from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


class ExtractResponse(BaseModel):
    bankName: Optional[str] = None
    amount: Optional[float] = None
    transactionId: Optional[str] = None
    timestamp: Optional[str] = None
    currency: Optional[str] = None
    confidence: float = 0.0

    @field_validator("confidence", mode="before")
    @classmethod
    def clamp_confidence(cls, value: Any) -> float:
        if value is None:
            return 0.0
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            return 0.0
        if parsed != parsed:  # NaN
            return 0.0
        return max(0.0, min(1.0, parsed))


class HealthResponse(BaseModel):
    status: str
    backend: str = "ollama"
    ollama_reachable: bool = False
    model: str
    model_available: bool = False
    peft_loaded: bool = False
    device: Optional[str] = None
