import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, File, UploadFile

from .config import get_ollama_model, get_port, get_vlm_backend
from .ollama_client import check_ollama_health, extract_from_image as ollama_extract
from .schemas import ExtractResponse, HealthResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    if get_vlm_backend() == "peft":
        from .hf_client import load_peft_model

        load_peft_model()
    yield


app = FastAPI(
    title="Birr Track VLM Inference",
    description="Receipt extraction via Ollama or fine-tuned Qwen2.5-VL (PEFT)",
    version="1.1.0",
    lifespan=lifespan,
)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    backend = get_vlm_backend()
    if backend == "peft":
        from .hf_client import get_peft_device, is_peft_loaded

        from .config import get_hf_base_model, get_lora_adapter_path

        loaded = is_peft_loaded()
        adapter = get_lora_adapter_path()
        model_name = get_hf_base_model()
        if adapter is not None:
            model_name = f"{model_name} + {adapter.name}"
        status = "ok" if loaded else "degraded"
        return HealthResponse(
            status=status,
            backend="peft",
            ollama_reachable=False,
            model=model_name,
            model_available=loaded,
            peft_loaded=loaded,
            device=get_peft_device(),
        )

    reachable, model_available = await check_ollama_health()
    status = "ok" if reachable and model_available else "degraded"
    return HealthResponse(
        status=status,
        backend="ollama",
        ollama_reachable=reachable,
        model=get_ollama_model(),
        model_available=model_available,
        peft_loaded=False,
    )


@app.post("/extract", response_model=ExtractResponse)
async def extract(file: UploadFile = File(...)) -> ExtractResponse:
    image_bytes = await file.read()
    logger.info(
        "Extract request filename=%s size=%d backend=%s",
        file.filename,
        len(image_bytes),
        get_vlm_backend(),
    )
    if get_vlm_backend() == "peft":
        from .hf_client import extract_from_image as peft_extract

        return await peft_extract(image_bytes)
    return await ollama_extract(image_bytes)


def run() -> None:
    import uvicorn

    from .config import get_host

    uvicorn.run(
        "app.main:app",
        host=get_host(),
        port=get_port(),
        reload=False,
    )


if __name__ == "__main__":
    run()
