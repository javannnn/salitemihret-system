#!/usr/bin/env bash
set -euo pipefail

LLAMA_DIR="${HOME}/.local/llama.cpp"
MODEL_DIR="${HOME}/.cache/models/qwen2.5-3b-instruct-gguf"
MODEL_PATH="${MODEL_DIR}/qwen2.5-3b-instruct-q4_k_m.gguf"
HOST="${LLAMA_HOST:-127.0.0.1}"
PORT="${LLAMA_PORT:-8081}"
THREADS="${LLAMA_THREADS:-8}"
CTX_SIZE="${LLAMA_CTX_SIZE:-4096}"
MODEL_ALIAS="${LLAMA_MODEL_ALIAS:-qwen2.5-3b-instruct-q4_k_m}"
LLAMA_SERVER="${LLAMA_SERVER:-}"

if [[ -z "${LLAMA_SERVER}" ]]; then
    if [[ -x "${LLAMA_DIR}/bin/llama-server" ]]; then
        LLAMA_SERVER="${LLAMA_DIR}/bin/llama-server"
    else
        LLAMA_SERVER="$(find "${LLAMA_DIR}" -maxdepth 2 -type f -name llama-server | head -n 1 || true)"
    fi
fi

if [[ -z "${LLAMA_SERVER}" || ! -x "${LLAMA_SERVER}" ]]; then
    echo "llama-server not found under ${LLAMA_DIR}" >&2
    exit 1
fi

if [[ ! -f "${MODEL_PATH}" ]]; then
    echo "Model file not found at ${MODEL_PATH}" >&2
    exit 1
fi

LLAMA_RUNTIME_DIR="$(dirname "${LLAMA_SERVER}")"
export LD_LIBRARY_PATH="${LLAMA_RUNTIME_DIR}:${LD_LIBRARY_PATH:-}"

exec "${LLAMA_SERVER}" \
    --host "${HOST}" \
    --port "${PORT}" \
    --model "${MODEL_PATH}" \
    --alias "${MODEL_ALIAS}" \
    --ctx-size "${CTX_SIZE}" \
    --threads "${THREADS}" \
    --parallel 1
