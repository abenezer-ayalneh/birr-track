#!/usr/bin/env python3
"""
Emit LLaMA-Factory train YAML matching train_qwen_vl.ipynb (single source of truth for hyperparams).

Use this locally so you can validate installs + dataset registration + a few training steps
before uploading anything to Kaggle.

Prerequisites:
  - Run `python prepare_dataset.py` first (creates train.json, val.json, dataset_info.json here).
  - Install LLaMA-Factory the same way as the notebook (clone v0.9.2 + pip install ".[torch,metrics]").

Examples:
  python write_train_config.py --output-dir ./runs/full
  python write_train_config.py --smoke --output-dir ./runs/smoke
  llamafactory-cli train ./runs/smoke/train_config.yaml

Apple Silicon (MPS): Accelerate rejects fp16 on MPS. Use --mps to emit bf16 instead:
  python write_train_config.py --smoke --mps --output-dir ./runs/smoke-mps
  llamafactory-cli train ./runs/smoke-mps/train_config.yaml
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent


def yaml_scalar(value: object) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        text = repr(value)
        if text.endswith(".0") and "." in text:
            return text[:-2]
        return text
    raise TypeError(f"Unsupported config value type: {type(value).__name__}")


def dump_yaml(path: Path, data: dict[str, object]) -> None:
    lines = [f"{key}: {yaml_scalar(val)}" for key, val in data.items()]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def base_train_config(*, dataset_dir: Path, output_dir: Path, smoke: bool, mps: bool) -> dict[str, object]:
    cfg: dict[str, object] = {
        "model_name_or_path": "Qwen/Qwen2.5-VL-3B-Instruct",
        "trust_remote_code": True,
        "stage": "sft",
        "do_train": True,
        "finetuning_type": "lora",
        "lora_target": "all",
        "lora_rank": 16,
        "lora_alpha": 32,
        "lora_dropout": 0.05,
        "freeze_vision_tower": True,
        "dataset": "birrtrack_train",
        "eval_dataset": "birrtrack_val",
        "dataset_dir": str(dataset_dir.resolve()),
        "template": "qwen2_vl",
        "cutoff_len": 2048,
        "overwrite_cache": True,
        "preprocessing_num_workers": 2,
        "output_dir": str(output_dir.resolve()),
        "overwrite_output_dir": True,
        "logging_steps": 5,
        "save_steps": 50,
        "save_total_limit": 2,
        "plot_loss": True,
        "per_device_train_batch_size": 1,
        "per_device_eval_batch_size": 1,
        "gradient_accumulation_steps": 8,
        "learning_rate": 1.0e-4,
        "num_train_epochs": 10.0,
        "lr_scheduler_type": "cosine",
        "warmup_ratio": 0.03,
        # CUDA (Kaggle T4): fp16. Apple MPS: Accelerate requires fp16=false; bf16 is the usual path.
        "fp16": not mps,
        "bf16": mps,
        "gradient_checkpointing": True,
        "eval_strategy": "epoch",
        "load_best_model_at_end": False,
        "report_to": "none",
        "seed": 42,
    }

    if smoke:
        cfg["max_steps"] = 8
        cfg["num_train_epochs"] = 1.0
        cfg["logging_steps"] = 1
        cfg["save_steps"] = 4
        cfg["eval_strategy"] = "no"
        cfg["save_total_limit"] = 1

    return cfg


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--dataset-dir",
        type=Path,
        default=SCRIPT_DIR,
        help=f"Folder containing train.json, val.json, dataset_info.json (default: {SCRIPT_DIR})",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        required=True,
        help="Where checkpoints + logs go (created if missing).",
    )
    parser.add_argument(
        "--smoke",
        action="store_true",
        help="Write a short-run config (max_steps=8, eval disabled) for local sanity checks.",
    )
    parser.add_argument(
        "--mps",
        action="store_true",
        help="Apple Silicon: set fp16=false and bf16=true (avoids 'fp16 mixed precision requires a GPU (not mps)').",
    )
    parser.add_argument(
        "--config-name",
        default="train_config.yaml",
        help="Output filename inside output-dir (default: train_config.yaml).",
    )
    args = parser.parse_args()

    for name in ("train.json", "val.json", "dataset_info.json"):
        p = args.dataset_dir / name
        if not p.is_file():
            print(f"ERROR: missing {p}", file=sys.stderr)
            print("Run `python prepare_dataset.py` from this directory first.", file=sys.stderr)
            return 1

    args.output_dir.mkdir(parents=True, exist_ok=True)
    cfg = base_train_config(dataset_dir=args.dataset_dir, output_dir=args.output_dir, smoke=args.smoke, mps=args.mps)
    out_path = args.output_dir / args.config_name
    dump_yaml(out_path, cfg)
    print(f"Wrote {out_path}")
    print("\nNext (same CLI Kaggle uses):\n")
    print(f"  llamafactory-cli train {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
