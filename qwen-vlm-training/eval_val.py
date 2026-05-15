#!/usr/bin/env python3
"""
Compare fine-tuned adapter predictions vs validation labels (and optional Ollama baseline).

Usage:
  python eval_val.py --adapter ./runs/full
  python eval_val.py --adapter ./runs/full --ollama-url http://127.0.0.1:8000

Requires: pip install -r requirements.txt
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Optional

SCRIPT_DIR = Path(__file__).resolve().parent
VAL_JSON = SCRIPT_DIR / "val.json"
PROMPT_PATH = SCRIPT_DIR / "training_prompt.txt"
TARGET_FIELDS = ("amount", "bank", "currency", "date", "txn_id")


def load_prompt() -> str:
    return PROMPT_PATH.read_text(encoding="utf-8").strip()


def parse_label_json(text: str) -> dict[str, Any]:
    return json.loads(text.strip())


def field_match(expected: Any, got: Any) -> bool:
    if expected is None and got is None:
        return True
    if isinstance(expected, float) or isinstance(got, float):
        try:
            return abs(float(expected) - float(got)) < 0.01
        except (TypeError, ValueError):
            return False
    if isinstance(expected, str) and isinstance(got, str):
        return expected.strip().lower() == got.strip().lower()
    return expected == got


def score_example(expected: dict[str, Any], predicted: dict[str, Any]) -> dict[str, bool]:
    return {field: field_match(expected.get(field), predicted.get(field)) for field in TARGET_FIELDS}


def extract_json_from_text(text: str) -> Optional[dict[str, Any]]:
    stripped = text.strip()
    candidates = [stripped]
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", stripped, re.IGNORECASE)
    if fence:
        candidates.append(fence.group(1).strip())
    obj = re.search(r"\{[\s\S]*\}", stripped)
    if obj:
        candidates.append(obj.group(0))
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            continue
    return None


class PeftReceiptModel:
    def __init__(self, adapter_path: Path, base_model: str, device: str, prompt: str) -> None:
        import gc

        import torch
        from peft import PeftModel
        from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration

        self._prompt = prompt
        self._device = device
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        self._processor = AutoProcessor.from_pretrained(base_model, trust_remote_code=True)
        dtype = torch.float16 if device.startswith("cuda") else torch.float32
        base = Qwen2_5_VLForConditionalGeneration.from_pretrained(
            base_model,
            torch_dtype=dtype,
            device_map={"": device},
            trust_remote_code=True,
            low_cpu_mem_usage=True,
        )
        self._model = PeftModel.from_pretrained(base, str(adapter_path))
        self._model.eval()
        self._pad_token_id = (
            self._processor.tokenizer.pad_token_id or self._processor.tokenizer.eos_token_id
        )

    def predict(self, image_path: Path) -> str:
        import torch
        from qwen_vl_utils import process_vision_info

        user_text = self._prompt.replace("<image>", "").strip()
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": str(image_path.resolve())},
                    {"type": "text", "text": user_text},
                ],
            }
        ]
        text_prompt = self._processor.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        image_inputs, video_inputs = process_vision_info(messages)
        inputs = self._processor(
            text=[text_prompt],
            images=image_inputs,
            videos=video_inputs,
            padding=True,
            return_tensors="pt",
        ).to(self._device)

        with torch.inference_mode():
            output_ids = self._model.generate(
                **inputs,
                max_new_tokens=256,
                do_sample=False,
                pad_token_id=self._pad_token_id,
            )
        input_lengths = inputs.input_ids.shape[1]
        return self._processor.batch_decode(
            output_ids[:, input_lengths:].cpu(), skip_special_tokens=True
        )[0]


def run_ollama_extract(ollama_url: str, image_path: Path) -> Optional[dict[str, Any]]:
    try:
        import httpx
    except ImportError:
        print("httpx not installed; skip --ollama-url", file=sys.stderr)
        return None

    with image_path.open("rb") as f:
        files = {"file": (image_path.name, f, "image/jpeg")}
        try:
            response = httpx.post(f"{ollama_url.rstrip('/')}/extract", files=files, timeout=120.0)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            print(f"Ollama request failed for {image_path.name}: {exc}", file=sys.stderr)
            return None

    data = response.json()
    return {
        "amount": data.get("amount"),
        "bank": data.get("bankName"),
        "currency": data.get("currency"),
        "date": data.get("timestamp"),
        "txn_id": data.get("transactionId"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--adapter", type=Path, required=True, help="LoRA adapter directory")
    parser.add_argument("--val-json", type=Path, default=VAL_JSON)
    parser.add_argument("--base-model", default="Qwen/Qwen2.5-VL-3B-Instruct")
    parser.add_argument("--device", default="", help="cuda:0, mps, or cpu (auto if empty)")
    parser.add_argument("--ollama-url", default="", help="Optional vlm-inference URL for baseline")
    parser.add_argument("--limit", type=int, default=0, help="Max examples (0 = all)")
    args = parser.parse_args()

    if not args.val_json.is_file():
        print(f"ERROR: missing {args.val_json}. Run prepare_dataset.py first.", file=sys.stderr)
        return 1
    if not args.adapter.is_dir():
        print(f"ERROR: adapter dir not found: {args.adapter}", file=sys.stderr)
        return 1

    import torch

    device = args.device.strip()
    if not device:
        if torch.cuda.is_available():
            device = "cuda:0"
        elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            device = "mps"
        else:
            device = "cpu"

    examples = json.loads(args.val_json.read_text(encoding="utf-8"))
    if args.limit > 0:
        examples = examples[: args.limit]

    print(f"Loading adapter from {args.adapter} on {device}...")
    model = PeftReceiptModel(args.adapter, args.base_model, device, load_prompt())

    peft_scores: dict[str, list[bool]] = {f: [] for f in TARGET_FIELDS}
    ollama_scores: dict[str, list[bool]] = {f: [] for f in TARGET_FIELDS}

    for idx, ex in enumerate(examples):
        image_path = Path(ex["images"][0])
        if not image_path.is_file():
            print(f"SKIP missing image: {image_path}", file=sys.stderr)
            continue
        expected = parse_label_json(ex["conversations"][1]["value"])

        raw = model.predict(image_path)
        pred = extract_json_from_text(raw)
        if pred is None:
            print(f"[{idx}] {image_path.name}: PEFT parse failed — {raw[:120]!r}")
            continue

        matches = score_example(expected, pred)
        for field, ok in matches.items():
            peft_scores[field].append(ok)
        status = " ".join(f"{f}:{'OK' if matches[f] else 'MISS'}" for f in TARGET_FIELDS)
        print(f"[{idx}] PEFT {image_path.name} {status}")

        if args.ollama_url:
            ollama_pred = run_ollama_extract(args.ollama_url, image_path)
            if ollama_pred:
                o_matches = score_example(expected, ollama_pred)
                for field, ok in o_matches.items():
                    ollama_scores[field].append(ok)
                o_status = " ".join(f"{f}:{'OK' if o_matches[f] else 'MISS'}" for f in TARGET_FIELDS)
                print(f"     Ollama {o_status}")

    def print_summary(name: str, scores: dict[str, list[bool]]) -> None:
        if not scores[TARGET_FIELDS[0]]:
            return
        n = len(scores[TARGET_FIELDS[0]])
        print(f"\n{name} ({n} examples):")
        for field in TARGET_FIELDS:
            correct = sum(scores[field])
            print(f"  {field}: {correct}/{n} ({100 * correct / n:.0f}%)")
        all_ok = sum(1 for i in range(n) if all(scores[f][i] for f in TARGET_FIELDS))
        print(f"  all fields exact: {all_ok}/{n} ({100 * all_ok / n:.0f}%)")

    print_summary("PEFT adapter", peft_scores)
    print_summary("Ollama baseline", ollama_scores)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
