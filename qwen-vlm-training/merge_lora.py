"""Merge the trained LoRA adapter into the Qwen2.5-VL-3B-Instruct base.

Produces a full-precision HuggingFace model that downstream tools (llama.cpp
convert_hf_to_gguf.py) can ingest. Forces CPU + fp32 so it runs anywhere,
including the deployment server.

Inputs:
  - adapter:  ../vlm-inference/adapters/qwen25vl-3b-birrtrack-lora
  - base:     Qwen/Qwen2.5-VL-3B-Instruct  (downloaded from HF on first run)

Output:
  - merged/qwen25vl-3b-birrtrack/    (HF model, ~7GB safetensors)
"""

from __future__ import annotations

import argparse
import logging
import shutil
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("merge")

BASE_MODEL = "Qwen/Qwen2.5-VL-3B-Instruct"
DEFAULT_ADAPTER = Path(__file__).resolve().parent.parent / "vlm-inference" / "adapters" / "qwen25vl-3b-birrtrack-lora"
DEFAULT_OUTPUT = Path(__file__).resolve().parent / "merged" / "qwen25vl-3b-birrtrack"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--adapter", type=Path, default=DEFAULT_ADAPTER)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--base", default=BASE_MODEL)
    args = parser.parse_args()

    if not (args.adapter / "adapter_config.json").exists():
        raise SystemExit(f"adapter_config.json not found in {args.adapter}")

    if args.output.exists():
        log.warning("Removing existing output dir %s", args.output)
        shutil.rmtree(args.output)
    args.output.mkdir(parents=True, exist_ok=True)

    log.info("Loading processor for %s", args.base)
    processor = AutoProcessor.from_pretrained(args.base, trust_remote_code=True)

    log.info("Loading base model %s (fp16 on CPU; cached from prior run if available)", args.base)
    # Avoid device_map + low_cpu_mem_usage: they trigger accelerate dispatch and PEFT's
    # subsequent adapter attach demands an offload_dir when RAM is tight. Plain load works.
    base = Qwen2_5_VLForConditionalGeneration.from_pretrained(
        args.base,
        torch_dtype=torch.float16,
        trust_remote_code=True,
    )

    log.info("Attaching LoRA adapter %s", args.adapter)
    model = PeftModel.from_pretrained(base, str(args.adapter))

    log.info("Merging adapter weights into base (peft.merge_and_unload)...")
    merged = model.merge_and_unload()

    log.info("Saving merged model to %s", args.output)
    merged.save_pretrained(args.output, safe_serialization=True)
    processor.save_pretrained(args.output)

    log.info("Done. Output: %s", args.output)


if __name__ == "__main__":
    main()
