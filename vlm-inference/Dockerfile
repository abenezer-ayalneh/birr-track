FROM pytorch/pytorch:2.4.1-cuda12.1-cudnn9-runtime

WORKDIR /app

# Install system deps needed by Pillow / qwen-vl-utils
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

COPY requirements-peft.txt .
COPY requirements.txt .
RUN pip install --no-cache-dir runpod -r requirements-peft.txt

COPY app/ app/
COPY prompts/ prompts/
COPY handler.py .

# Model weights live on a mounted RunPod Network Volume.
# Set LORA_ADAPTER_PATH and HF_BASE_MODEL via endpoint env vars,
# or rely on defaults in app/config.py (adapter at /runpod-volume/adapter,
# base model downloaded to HF cache on the volume).
ENV HF_HOME=/runpod-volume/hf-cache
ENV LORA_ADAPTER_PATH=/runpod-volume/adapter
ENV VLM_BACKEND=peft

CMD ["python", "-u", "handler.py"]
