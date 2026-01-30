#!/usr/bin/env bash
# Test RunPod endpoint with evaluator ON (--evaluate).
# Usage: RUNPOD_API_KEY=your_key RUNPOD_ENDPOINT=maz6or8l4hb9h3 ./test_runpod.sh
# Or:   export RUNPOD_API_KEY=... RUNPOD_ENDPOINT=... && ./test_runpod.sh

set -e
ENDPOINT="${RUNPOD_ENDPOINT:?Set RUNPOD_ENDPOINT (e.g. maz6or8l4hb9h3)}"
API_KEY="${RUNPOD_API_KEY:?Set RUNPOD_API_KEY}"

# Single problem; set "evaluate": true so generate.py runs with --evaluate (test and validate components)
INPUT='{
  "input": {
    "problem_texts": ["Solve for x: 2x + 5 = 13"],
    "evaluate": true
  }
}'

echo "POST /run (evaluate=true)..."
RESP=$(curl -s -X POST "https://api.runpod.ai/v2/${ENDPOINT}/run" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_KEY}" \
  -d "$INPUT")

echo "$RESP" | head -c 500
echo ""
JOB_ID=$(echo "$RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$JOB_ID" ]; then
  echo "No job id in response. Check RUNPOD_API_KEY and RUNPOD_ENDPOINT."
  exit 1
fi
echo "Job ID: $JOB_ID"
echo "Poll: curl -s -H \"Authorization: Bearer \$RUNPOD_API_KEY\" \"https://api.runpod.ai/v2/${ENDPOINT}/status/${JOB_ID}\""
