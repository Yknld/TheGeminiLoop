#!/usr/bin/env bash
# Fetch RunPod job status and pull module + evaluation results + artifacts.
#
# For serverless runs: results are in the API response, not on the worker filesystem.
# Basic SSH (ssh.runpod.io) does NOT support SCP/SFTP; use this script instead.
#
# Usage:
#   RUNPOD_API_KEY=... RUNPOD_ENDPOINT=... ./pull_runpod_results.sh JOB_ID
#   ./pull_runpod_results.sh JOB_ID --out ./my_run
#
# Or if you already have status.json from GET .../status/JOB_ID:
#   python pull_runpod_output.py status.json --out .

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "${SCRIPT_DIR}/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "${SCRIPT_DIR}/.env"
  set +a
fi

# JOB_ID: first arg, or from last_runpod_job_id.txt (from test_runpod.sh / test_runpod_multi.sh)
if [ -n "${1:-}" ] && [ "$1" != "--out" ] && [ "$1" != "-o" ]; then
  JOB_ID="$1"
  shift || true
elif [ -f "${SCRIPT_DIR}/last_runpod_job_id.txt" ]; then
  JOB_ID=$(cat "${SCRIPT_DIR}/last_runpod_job_id.txt")
  echo "Using saved job id: $JOB_ID"
else
  echo "Usage: $0 JOB_ID [--out DIR]"
  echo "  Or run test_runpod.sh / test_runpod_multi.sh first to save a job id, then: $0 --out ."
  exit 1
fi
if [ -z "${RUNPOD_ENDPOINT:-}" ]; then
  echo "Error: RUNPOD_ENDPOINT is not set."
  echo "  Add it to ${SCRIPT_DIR}/.env (e.g. RUNPOD_ENDPOINT=your_endpoint_id)"
  echo "  Get the ID from RunPod dashboard: Endpoints -> your endpoint -> URL contains .../endpoints/YOUR_ID"
  exit 1
fi
if [ -z "${RUNPOD_API_KEY:-}" ]; then
  echo "Error: RUNPOD_API_KEY is not set. Add it to ${SCRIPT_DIR}/.env"
  exit 1
fi
ENDPOINT="$RUNPOD_ENDPOINT"
API_KEY="$RUNPOD_API_KEY"
STATUS_FILE="${SCRIPT_DIR}/status_${JOB_ID}.json"

echo "Fetching status for job ${JOB_ID}..."
HTTP_CODE=$(curl -s -w "%{http_code}" -o "${STATUS_FILE}" \
  -H "Authorization: Bearer ${API_KEY}" \
  "https://api.runpod.ai/v2/${ENDPOINT}/status/${JOB_ID}")

if ! python3 -c "import json; json.load(open('${STATUS_FILE}'))" 2>/dev/null; then
  echo "Invalid JSON in response (HTTP ${HTTP_CODE})."
  if [ ! -s "${STATUS_FILE}" ]; then
    echo "  Response body: (empty)"
    echo "  Possible causes: wrong endpoint ID, job not found or expired, or invalid API key."
  else
    echo "  First 500 chars:"
    head -c 500 "${STATUS_FILE}"
  fi
  echo ""
  echo "  Verify in RunPod: Endpoints -> your endpoint (URL has .../endpoints/YOUR_ID), and that this job ID exists."
  exit 1
fi

echo "Pulling module, evaluation results, and artifacts..."
python3 "${SCRIPT_DIR}/pull_runpod_output.py" "${STATUS_FILE}" "$@"
echo "Done. Status saved to ${STATUS_FILE} (can delete after review)."
