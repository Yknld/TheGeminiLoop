#!/usr/bin/env bash
# Test RunPod endpoint with evaluator ON (--evaluate).
# Usage: RUNPOD_API_KEY=your_key RUNPOD_ENDPOINT=maz6or8l4hb9h3 ./test_runpod.sh
# Or:   export RUNPOD_API_KEY=... RUNPOD_ENDPOINT=... && ./test_runpod.sh

set -e
ENDPOINT="${RUNPOD_ENDPOINT:?Set RUNPOD_ENDPOINT (e.g. maz6or8l4hb9h3)}"
API_KEY="${RUNPOD_API_KEY:?Set RUNPOD_API_KEY}"

# Single problem; set "evaluate": true so generate.py runs with --evaluate (test and validate components).
# To push to Supabase: set RUNPOD_USER_ID and RUNPOD_LESSON_ID (UUIDs) when running this script, e.g.:
#   RUNPOD_USER_ID=2202c52b-a017-4f1a-8330-24c9eb5224c4 RUNPOD_LESSON_ID=0fed25d6-899d-49c5-89b8-238658cec1be ./test_runpod.sh
if [ -n "${RUNPOD_USER_ID-}" ] && [ -n "${RUNPOD_LESSON_ID-}" ]; then
  EXTRA=', "user_id": "'"$RUNPOD_USER_ID"'", "lesson_id": "'"$RUNPOD_LESSON_ID"'"'
else
  EXTRA=''
fi
INPUT='{
  "input": {
    "problem_texts": ["Solve for x: 2x + 5 = 13"],
    "evaluate": true'"$EXTRA"'
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
echo ""
echo "Poll until COMPLETED, then pull module + artifacts:"
echo "  curl -s -H \"Authorization: Bearer \$RUNPOD_API_KEY\" \"https://api.runpod.ai/v2/${ENDPOINT}/status/${JOB_ID}\" > status.json"
echo "  python pull_runpod_output.py status.json --out ."
echo ""
echo "Or poll once: curl -s -H \"Authorization: Bearer \$RUNPOD_API_KEY\" \"https://api.runpod.ai/v2/${ENDPOINT}/status/${JOB_ID}\""
