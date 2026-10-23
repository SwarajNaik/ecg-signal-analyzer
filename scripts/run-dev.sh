#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"

cleanup() {
  jobs -p | xargs -r kill 2>/dev/null || true
}
trap cleanup EXIT INT TERM

cd "$project_root"
.venv/bin/uvicorn ecg_analyzer.main:app --host 127.0.0.1 --port 8000 --reload &

cd "$project_root/frontend"
npm run dev &

wait

