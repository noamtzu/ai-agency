FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip python3-venv ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt

# Install a CUDA-enabled PyTorch build for CUDA 12.1, then the rest of requirements.
# If you change the CUDA base image, update TORCH_INDEX_URL accordingly.
ARG TORCH_INDEX_URL="https://download.pytorch.org/whl/cu121"
RUN python3 -m pip install --no-cache-dir --upgrade pip \
  && python3 -m pip install --no-cache-dir torch --index-url ${TORCH_INDEX_URL} \
  && python3 -m pip install --no-cache-dir -r /app/requirements.txt

COPY main.py /app/main.py

ENV HOST=0.0.0.0
ENV PORT=8080

CMD ["sh", "-lc", "uvicorn main:app --host ${HOST} --port ${PORT}"]


