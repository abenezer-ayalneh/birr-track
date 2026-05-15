#!/usr/bin/env python3
"""
Stage files for uploading as a Kaggle Dataset (birrtrack-receipts).

Prerequisites:
  python prepare_dataset.py

Creates:
  kaggle-upload/
    train.json
    val.json
    receipts/   (symlinks or copies of images referenced in labeled-data.csv)

Usage:
  python package_kaggle_dataset.py
  # Zip kaggle-upload/ or upload the folder via kaggle.com/datasets
"""

from __future__ import annotations

import argparse
import csv
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TRAINING_DIR = Path(__file__).resolve().parent
LABELED_CSV = REPO_ROOT / "documents" / "labeled-data.csv"
RECEIPTS_DIR = REPO_ROOT / "documents" / "receipts"
DEFAULT_OUT = TRAINING_DIR / "kaggle-upload"


def load_file_names(csv_path: Path) -> list[str]:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        return [row["file_name"].strip() for row in reader if row.get("file_name", "").strip()]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--copy", action="store_true", help="Copy images instead of symlinking")
    args = parser.parse_args()

    for name in ("train.json", "val.json"):
        src = TRAINING_DIR / name
        if not src.is_file():
            print(f"ERROR: missing {src}. Run prepare_dataset.py first.", file=sys.stderr)
            return 1

    if not LABELED_CSV.is_file():
        print(f"ERROR: missing {LABELED_CSV}", file=sys.stderr)
        return 1

    out = args.output_dir
    receipts_out = out / "receipts"
    if out.exists():
        shutil.rmtree(out)
    receipts_out.mkdir(parents=True)

    for name in ("train.json", "val.json"):
        shutil.copy2(TRAINING_DIR / name, out / name)

    missing: list[str] = []
    for file_name in load_file_names(LABELED_CSV):
        src = RECEIPTS_DIR / file_name
        dst = receipts_out / file_name
        if not src.is_file():
            missing.append(file_name)
            continue
        if args.copy:
            shutil.copy2(src, dst)
        else:
            dst.symlink_to(src.resolve())

    if missing:
        print(f"ERROR: {len(missing)} images missing from {RECEIPTS_DIR}", file=sys.stderr)
        for name in missing[:10]:
            print(f"  - {name}", file=sys.stderr)
        return 1

    print(f"Staged Kaggle dataset at {out}")
    print(f"  train.json, val.json, receipts/ ({len(list(receipts_out.iterdir()))} images)")
    print("Upload this folder to https://www.kaggle.com/datasets (private), slug: birrtrack-receipts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
