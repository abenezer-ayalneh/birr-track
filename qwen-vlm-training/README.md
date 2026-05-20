# Qwen2.5-VL fine-tuning for Birr Track

End-to-end recipe for fine-tuning `Qwen/Qwen2.5-VL-3B-Instruct` on Ethiopian bank receipt screenshots, designed to run on Kaggle's free GPU tier.

## What lives here

| File | Purpose |
| --- | --- |
| `prepare_dataset.py` | Converts `documents/labeled-data.csv` + `documents/receipts/` into LLaMA-Factory sharegpt-vision JSON (`train.json` / `val.json`). |
| `write_train_config.py` | Writes `train_config.yaml` (same hyperparams as the Kaggle notebook). Use `--smoke` for a tiny run to validate your machine before uploading. |
| `train_qwen_vl_kaggle.ipynb` | **Preferred** Kaggle notebook — Python 3.12.12 (numpy 2.x + setuptools fixes). |
| `train_qwen_vl.ipynb` | Legacy notebook (complex numpy workarounds); use the Kaggle notebook instead. |
| `package_kaggle_dataset.py` | Stages `kaggle-upload/` for Kaggle Dataset upload. |
| `eval_val.py` | Field-level accuracy on `val.json` vs adapter (optional Ollama baseline). |
| `training_prompt.txt` | Canonical extraction prompt (shared with `vlm-inference` PEFT mode). |
| `requirements.txt` | Pinned versions for reproducibility outside Kaggle. |

## Why Kaggle?

- 2x Tesla T4 (16 GB each = 32 GB total), 30 GPU hours/week — free, no card required.
- More VRAM than free Colab; sessions can run up to 12 hours.
- Datasets are cached and version-controlled, so re-runs are cheap.

The notebook uses one T4 by default because our dataset is small (~90 train examples) and single-GPU training is more predictable. To use both GPUs, see the commented `torchrun` line in step 5 of the notebook.

## End-to-end workflow

### 1. Prepare the dataset locally

From the repo root:

```bash
cd qwen-vlm-training
python prepare_dataset.py
```

This produces:

- `train.json` — 90% of examples
- `val.json` — 10% of examples
- `dataset_info.json` — LLaMA-Factory registry snippet (the notebook regenerates this on Kaggle, so it's informational here)

The script verifies that every `file_name` referenced in `documents/labeled-data.csv` exists in `documents/receipts/`. If anything is missing, it fails before writing.

### 1b. Local smoke test (optional, before Kaggle)

You can run the **same** LLaMA-Factory CLI locally so you only use Kaggle for the long GPU job. This catches install issues, bad `dataset_info.json`, and path mistakes without round-tripping uploads.

**Requirements:** a Python 3.10+ venv, an **NVIDIA GPU** with enough VRAM for Qwen2.5-VL-3B LoRA in fp16 (roughly **12 GB+** free; 16 GB is comfortable). On a Mac without CUDA, use a cloud GPU or skip to Kaggle — CPU-only is not practical for this model.

```bash
cd qwen-vlm-training
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -U pip setuptools wheel "setuptools>=70"
pip install -r requirements.txt

# Same install pattern as the Kaggle notebook (pick a clone directory you like):
rm -rf /tmp/LLaMA-Factory && git clone --depth 1 --branch v0.9.2 https://github.com/hiyouga/LLaMA-Factory.git /tmp/LLaMA-Factory
pip install "/tmp/LLaMA-Factory[torch,metrics]"

python prepare_dataset.py
python write_train_config.py --smoke --output-dir ./runs/smoke
CUDA_VISIBLE_DEVICES=0 llamafactory-cli train ./runs/smoke/train_config.yaml
```

**Apple Silicon (MPS):** Hugging Face Accelerate does not allow `fp16` on MPS; you will see `fp16 mixed precision requires a GPU (not 'mps')`. Regenerate the config with **`--mps`** (sets `fp16: false`, `bf16: true`) and run without `CUDA_VISIBLE_DEVICES`:

```bash
python write_train_config.py --smoke --mps --output-dir ./runs/smoke-mps
llamafactory-cli train ./runs/smoke-mps/train_config.yaml
```

When the smoke run finishes, generate the **full** config (10 epochs, eval each epoch) for a long local run or for reference on Kaggle:

```bash
python write_train_config.py --output-dir ./runs/full
CUDA_VISIBLE_DEVICES=0 llamafactory-cli train ./runs/full/train_config.yaml
```

On Kaggle, you can keep using the notebook’s inline YAML cell, or upload `runs/full/train_config.yaml` and point the train cell at it — the contents match `write_train_config.py` without `--smoke`.

### 2. Upload as a Kaggle Dataset

```bash
python package_kaggle_dataset.py
# Upload the generated kaggle-upload/ folder (or zip it first)
```

Or upload manually:

1. Go to <https://www.kaggle.com/datasets> and click **New Dataset**.
2. Upload contents of `kaggle-upload/` (or `train.json`, `val.json`, and `receipts/`).
3. Name the dataset slug **`birrtrack-receipts`** (or change `KAGGLE_DATASET_NAME` in the notebook).
4. Set visibility to **Private** (labeled receipt data).

Expected layout once mounted on Kaggle:

```
/kaggle/input/birrtrack-receipts/
├── train.json
├── val.json
└── receipts/
    ├── cbe_screenshot_1.jpg
    ├── photo_1@18-04-2026_10-57-45.jpg
    └── ...
```

### 3. Run the notebook on Kaggle

1. Create a new Kaggle Notebook from **`train_qwen_vl_kaggle.ipynb`**.
2. Right panel:
   - **Environment** → **Python 3.12** (default on Kaggle, e.g. 3.12.12)
   - **Accelerator** → `GPU T4 x2`
   - **Internet** → ON
   - **Add Data** → attach `birrtrack-receipts`
3. **Run All**. Expect ~5–15 minutes for training plus setup.
4. Download **`qwen25vl-3b-birrtrack-lora.zip`** from Output.

### 4. Evaluate the adapter locally

```bash
# Unzip adapter to runs/full/ (or any directory with adapter_config.json)
python eval_val.py --adapter ./runs/full
python eval_val.py --adapter ./runs/full --ollama-url http://localhost:8000
```

### 5. Serve in production (`vlm-inference`)

See [`../vlm-inference/README.md`](../vlm-inference/README.md) — set `VLM_BACKEND=peft`, unzip the adapter to `vlm-inference/adapters/qwen25vl-3b-birrtrack-lora/`, and `pip install -r requirements-peft.txt`.

### Troubleshooting: `invalid-egg-fragment` on `pip install`

Modern pip rejects the legacy URL form:

`git+https://github.com/...#egg=llamafactory[torch,metrics]`

**Fix:** Re-import the latest `train_qwen_vl.ipynb` from this repo (the install cell now clones `v0.9.2` into `/kaggle/working/LLaMA-Factory` and runs `pip install "/kaggle/working/LLaMA-Factory[torch,metrics]"`).

If you prefer a one-liner without cloning, use PEP 508 (extras before `@`, quoted):

```bash
pip install "llamafactory[torch,metrics] @ git+https://github.com/hiyouga/LLaMA-Factory.git@v0.9.2"
```

**Internet** must stay **ON** for both `git clone` and Hugging Face downloads.

### Troubleshooting: `llamafactory … requires peft<=0.12.0, but you have peft 0.13.x`

LLaMA-Factory **v0.9.2** pins `peft` to `>=0.11.1,<=0.12.0` (and `trl` to `<=0.9.6`). A later `pip install … peft==0.13.2` line overrides that and pip reports a conflict.

**Fix:** After installing LLaMA-Factory, only add `qwen-vl-utils` (as in the current `train_qwen_vl.ipynb`). Do not reinstall `transformers`, `peft`, `accelerate`, or `trl` unless the versions stay inside [LLaMA-Factory v0.9.2 `requirements.txt`](https://github.com/hiyouga/LLaMA-Factory/blob/v0.9.2/requirements.txt).

### Troubleshooting: `pkgutil` has no attribute `ImpImporter` (jieba / pkg_resources)

On **Python 3.12**, an old **`pkg_resources`** (often from `/usr/lib/python3/dist-packages/`) can break when LLaMA-Factory imports **`jieba`** for metrics: it still references `pkgutil.ImpImporter`, which was removed in 3.12.

**Fix:** The notebook upgrades **`setuptools>=70`** (before LLaMA-Factory, after install, and again immediately before `llamafactory-cli train`) so a compatible `pkg_resources` wins on `sys.path`. If it still fails, set the notebook **Language** to **Python 3.10** in the right-hand settings.

### Troubleshooting: cuFFT / cuDNN / cuBLAS “Unable to register factory”

Harmless noise when TensorFlow/XLA and PyTorch are both present on the same GPU kernel. Training can continue once `llamafactory-cli` starts.

### Troubleshooting: pip install fails on Kaggle

Use **`train_qwen_vl_kaggle.ipynb`** (not `train_qwen_vl.ipynb`). Works on **Python 3.12.12** (Kaggle default). The install cell clones LLaMA-Factory v0.9.2, re-pins **numpy 2.2.2** for 3.12, upgrades **setuptools ≥ 70**, then adds `transformers==4.49.0` and `qwen-vl-utils`. Do not `pip install peft` afterward.

If you see `cannot import name '_center'` or `'numpy.ufunc' object has no attribute '__module__'`, a prior cell upgraded **system** numpy. **Session → Restart session**, use the latest `train_qwen_vl_kaggle.ipynb` (installs into `/kaggle/working/birrtrack_site` only), then **Run all**.

If you see `ImpImporter` during training, re-run the install cell, then the train cell (setuptools + `PYTHONPATH` fix is in both).

## Tuning knobs

If accuracy is unsatisfactory after the first run, try in this order:

| Change | Where | When |
| --- | --- | --- |
| `num_train_epochs: 20` (was 10) | cell 4 of the notebook | Underfitting (eval loss still dropping at end). |
| `lora_rank: 32` (was 16) | cell 4 | Plateaued loss with low eval accuracy. |
| `freeze_vision_tower: False` | cell 4 | Bank-specific visual quirks the base ViT misses. Increases VRAM significantly. |
| Add more labeled rows to `documents/labeled-data.csv` | repo | Always the best fix for a structured-extraction problem. |
| Switch base to `Qwen/Qwen2.5-VL-7B-Instruct` | cell 4 (`model_name_or_path`) | When 3B has clearly plateaued and you have headroom for QLoRA. Will need `bitsandbytes` + `quantization_bit: 4` in the LLaMA-Factory config. |

## Reproducibility

The exact stack is captured in `requirements.txt`. If a future LLaMA-Factory release changes the dataset/config schema, pin the `git clone --branch …` line in the install cell of the notebook to a specific tag or commit SHA.
