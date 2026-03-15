#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${LLAMA_LOG_FILE:-/tmp/llama-report-qa.log}"

setsid bash -lc "\"${SCRIPT_DIR}/run-llama-report-qa.sh\" >>\"${LOG_FILE}\" 2>&1 < /dev/null" >/dev/null 2>&1 &
echo $!
