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
JOB_ID="${1:?Usage: RUNPOD_API_KEY=... RUNPOD_ENDPOINT=... $0 JOB_ID [--out DIR]}"
shift || true
ENDPOINT="${RUNPOD_ENDPOINT:?Set RUNPOD_ENDPOINT (from dashboard URL, e.g. maz6or8l4hb9h3)}"
API_KEY="${RUNPOD_API_KEY:?Set RUNPOD_API_KEY}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATUS_FILE="${SCRIPT_DIR}/status_${JOB_ID}.json"

echo "Fetching status for job ${JOB_ID}..."
curl -s -H "Authorization: Bearer ${API_KEY}" \
  "https://api.runpod.ai/v2/${ENDPOINT}/status/${JOB_ID}" > "${STATUS_FILE}"

if ! python3 -c "import json; json.load(open('${STATUS_FILE}'))" 2>/dev/null; then
  echo "Invalid JSON in response. Check RUNPOD_API_KEY and RUNPOD_ENDPOINT. First 500 chars:"
  head -c 500 "${STATUS_FILE}"
  exit 1
fi

echo "Pulling module, evaluation results, and artifacts..."
python3 "${SCRIPT_DIR}/pull_runpod_output.py" "${STATUS_FILE}" "$@"
echo "Done. Status saved to ${STATUS_FILE} (can delete after review)."
