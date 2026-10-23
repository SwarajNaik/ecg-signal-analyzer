#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"

if [[ ! -x "$project_root/.venv/bin/uvicorn" ]]; then
  echo "Python environment is missing. Follow the setup steps in README.md."
  exit 1
fi

if [[ ! -d "$project_root/frontend/node_modules" ]]; then
  echo "Frontend dependencies are missing. Run npm install in frontend/."
  exit 1
fi

cd "$project_root/frontend"
npm run build

cd "$project_root"
echo "ECG Signal Analyzer: http://127.0.0.1:8000"
exec .venv/bin/uvicorn ecg_analyzer.main:app --host 127.0.0.1 --port 8000

