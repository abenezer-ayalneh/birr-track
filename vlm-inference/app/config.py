import os
from pathlib import Path
from typing import Optional

ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_PROMPT_PATH = ROOT_DIR / "prompts" / "receipt_extract.txt"
PEFT_PROMPT_PATH = ROOT_DIR / "prompts" / "receipt_extract_training.txt"
DEFAULT_ADAPTER_DIR = ROOT_DIR / "adapters" / "qwen25vl-3b-birrtrack-lora"


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return int(raw)


def get_host() -> str:
    return os.getenv("HOST", "0.0.0.0")


def get_port() -> int:
    return _env_int("PORT", 8000)


def get_ollama_host() -> str:
    return os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")


def get_ollama_model() -> str:
    return os.getenv("OLLAMA_MODEL", "qwen2.5vl:latest")


def get_request_timeout_ms() -> int:
    # Ollama cold-starts can exceed 30s; Nest VlmService uses 30s — raise both for local dev.
    return _env_int("VLM_REQUEST_TIMEOUT_MS", 120000)


def get_vlm_backend() -> str:
    return os.getenv("VLM_BACKEND", "ollama").strip().lower()


def get_hf_base_model() -> str:
    return os.getenv("HF_BASE_MODEL", "Qwen/Qwen2.5-VL-3B-Instruct").strip()


def get_hf_device() -> str:
    return os.getenv("HF_DEVICE", "").strip()


def get_lora_adapter_path() -> Optional[Path]:
    raw = os.getenv("LORA_ADAPTER_PATH", "").strip()
    path = Path(raw) if raw else DEFAULT_ADAPTER_DIR
    if path.is_dir() and (path / "adapter_config.json").is_file():
        return path.resolve()
    return None


def get_extract_prompt() -> str:
    override = os.getenv("VLM_EXTRACT_PROMPT", "").strip()
    if override:
        return override
    return DEFAULT_PROMPT_PATH.read_text(encoding="utf-8").strip()


def get_peft_extract_prompt() -> str:
    override = os.getenv("VLM_PEFT_PROMPT", "").strip()
    if override:
        return override
    return PEFT_PROMPT_PATH.read_text(encoding="utf-8").strip()
