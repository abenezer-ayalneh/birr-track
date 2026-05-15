#!/usr/bin/env python3
"""
Convert the labeled receipt CSV + images into LLaMA-Factory sharegpt-vision format
for fine-tuning Qwen2.5-VL-3B-Instruct.

Inputs (relative to repo root):
    documents/labeled-data.csv     # columns: file_name, amount, bank, currency, date, txn_id
    documents/receipts/<file>      # raw screenshots referenced by file_name

Outputs (next to this script):
    train.json                     # 90% split (sharegpt-vision JSON array)
    val.json                       # 10% split
    dataset_info.json              # Snippet to register both files in LLaMA-Factory

Usage:
    python prepare_dataset.py
    python prepare_dataset.py --val-fraction 0.1 --seed 42

The shape of one example is:
    {
      "images": ["<absolute path>/cbe_screenshot_1.jpg"],
      "conversations": [
        {"from": "human", "value": "<image>Extract receipt fields as JSON ..."},
        {"from": "gpt",   "value": "{\"amount\": 25000.0, \"bank\": ..., ...}"}
      ]
    }
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
LABELED_CSV = REPO_ROOT / "documents" / "labeled-data.csv"
RECEIPTS_DIR = REPO_ROOT / "documents" / "receipts"

# Field names mirror documents/labeled-data.csv exactly so the model output is
# directly comparable to the labels at eval time.
TARGET_FIELDS = ("amount", "bank", "currency", "date", "txn_id")

PROMPT_PATH = Path(__file__).resolve().parent / "training_prompt.txt"


def load_prompt() -> str:
    return PROMPT_PATH.read_text(encoding="utf-8").strip()


PROMPT = load_prompt()

NULL_LITERALS = {"", "null", "none", "n/a", "na"}


def is_null_value(value: str | None) -> bool:
    if value is None:
        return True
    return value.strip().lower() in NULL_LITERALS


def parse_amount(raw: str | None) -> float | None:
    if is_null_value(raw):
        return None
    cleaned = raw.replace(",", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_csv_date_to_iso(raw: str | None) -> str | None:
    """The CSV uses M/D/YYYY (e.g. `4/15/2026`); convert to ISO UTC midnight."""
    if is_null_value(raw):
        return None
    raw = raw.strip()
    for fmt in ("%m/%d/%Y", "%-m/%-d/%Y", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc)
            return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        except ValueError:
            continue
    return None


def normalize_field(raw: str | None) -> str | None:
    if is_null_value(raw):
        return None
    return raw.strip()


def build_label_object(row: dict[str, str]) -> dict[str, object]:
    return {
        "amount": parse_amount(row.get("amount")),
        "bank": normalize_field(row.get("bank")),
        "currency": normalize_field(row.get("currency")),
        "date": parse_csv_date_to_iso(row.get("date")),
        "txn_id": normalize_field(row.get("txn_id")),
    }


def serialize_label(label: dict[str, object]) -> str:
    # Compact JSON (no extra whitespace) keeps the target sequence short -> faster training.
    return json.dumps(label, ensure_ascii=False, separators=(",", ":"))


def load_rows(csv_path: Path) -> list[dict[str, str]]:
    # utf-8-sig strips the BOM that the source CSV ships with.
    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        return [row for row in reader if row.get("file_name", "").strip()]


def verify_images_exist(rows: list[dict[str, str]], receipts_dir: Path) -> list[str]:
    missing: list[str] = []
    for row in rows:
        if not (receipts_dir / row["file_name"]).is_file():
            missing.append(row["file_name"])
    return missing


def row_to_example(row: dict[str, str], receipts_dir: Path) -> dict[str, object]:
    image_path = (receipts_dir / row["file_name"]).resolve()
    label = build_label_object(row)
    return {
        "images": [str(image_path)],
        "conversations": [
            {"from": "human", "value": PROMPT},
            {"from": "gpt", "value": serialize_label(label)},
        ],
    }


def split_examples(
    examples: list[dict[str, object]],
    val_fraction: float,
    seed: int,
) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    if not 0.0 < val_fraction < 1.0:
        raise ValueError(f"val_fraction must be in (0, 1), got {val_fraction}")
    rng = random.Random(seed)
    shuffled = examples[:]
    rng.shuffle(shuffled)
    val_size = max(1, round(len(shuffled) * val_fraction))
    return shuffled[val_size:], shuffled[:val_size]


def write_json_array(path: Path, items: list[dict[str, object]]) -> None:
    with path.open("w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)


def write_dataset_info(path: Path, train_file: Path, val_file: Path) -> None:
    """Snippet ready to be merged into LLaMA-Factory's `data/dataset_info.json`."""
    info = {
        "birrtrack_train": {
            "file_name": str(train_file.name),
            "formatting": "sharegpt",
            "columns": {
                "messages": "conversations",
                "images": "images",
            },
            "tags": {
                "role_tag": "from",
                "content_tag": "value",
                "user_tag": "human",
                "assistant_tag": "gpt",
            },
        },
        "birrtrack_val": {
            "file_name": str(val_file.name),
            "formatting": "sharegpt",
            "columns": {
                "messages": "conversations",
                "images": "images",
            },
            "tags": {
                "role_tag": "from",
                "content_tag": "value",
                "user_tag": "human",
                "assistant_tag": "gpt",
            },
        },
    }
    with path.open("w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False, indent=2)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--csv", type=Path, default=LABELED_CSV, help=f"Labeled CSV (default: {LABELED_CSV})")
    parser.add_argument("--receipts-dir", type=Path, default=RECEIPTS_DIR, help=f"Image folder (default: {RECEIPTS_DIR})")
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parent, help="Output folder")
    parser.add_argument("--val-fraction", type=float, default=0.1, help="Validation split size (default: 0.1)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for the split (default: 42)")
    args = parser.parse_args()

    if not args.csv.is_file():
        print(f"ERROR: CSV not found at {args.csv}", file=sys.stderr)
        return 1
    if not args.receipts_dir.is_dir():
        print(f"ERROR: receipts dir not found at {args.receipts_dir}", file=sys.stderr)
        return 1

    rows = load_rows(args.csv)
    if not rows:
        print(f"ERROR: no labeled rows found in {args.csv}", file=sys.stderr)
        return 1

    missing = verify_images_exist(rows, args.receipts_dir)
    if missing:
        print(f"ERROR: {len(missing)} CSV rows reference images that do not exist in {args.receipts_dir}:", file=sys.stderr)
        for name in missing[:20]:
            print(f"  - {name}", file=sys.stderr)
        if len(missing) > 20:
            print(f"  ... and {len(missing) - 20} more", file=sys.stderr)
        return 1

    examples = [row_to_example(row, args.receipts_dir) for row in rows]
    train_examples, val_examples = split_examples(examples, args.val_fraction, args.seed)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    train_path = args.output_dir / "train.json"
    val_path = args.output_dir / "val.json"
    info_path = args.output_dir / "dataset_info.json"

    write_json_array(train_path, train_examples)
    write_json_array(val_path, val_examples)
    write_dataset_info(info_path, train_path, val_path)

    print(f"Wrote {len(train_examples)} train and {len(val_examples)} val examples")
    print(f"  - {train_path}")
    print(f"  - {val_path}")
    print(f"  - {info_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
