#!/usr/bin/env bash
# Test RunPod endpoint with multiple questions (evaluate ON).
# Usage: RUNPOD_API_KEY=your_key RUNPOD_ENDPOINT=maz6or8l4hb9h3 ./test_runpod_multi.sh
# Or:   export RUNPOD_API_KEY=... RUNPOD_ENDPOINT=... && ./test_runpod_multi.sh

set -e
ENDPOINT="${RUNPOD_ENDPOINT:?Set RUNPOD_ENDPOINT (e.g. maz6or8l4hb9h3)}"
API_KEY="${RUNPOD_API_KEY:?Set RUNPOD_API_KEY}"

# Multiple problems; set "evaluate": true to run browser evaluation.
# To push to Supabase: set RUNPOD_USER_ID and RUNPOD_LESSON_ID (UUIDs).
if [ -n "${RUNPOD_USER_ID-}" ] && [ -n "${RUNPOD_LESSON_ID-}" ]; then
  EXTRA=', "user_id": "'"$RUNPOD_USER_ID"'", "lesson_id": "'"$RUNPOD_LESSON_ID"'"'
else
  EXTRA=''
fi
INPUT='{
  "input": {
    "problem_texts": [
      "Solve for x: 2x + 5 = 13",
      "What is the area of a circle with radius 5?",
      "Find the derivative of f(x) = x^2 + 3x"
    ],
    "evaluate": true'"$EXTRA"'
  }
}'

echo "POST /run (multiple questions, evaluate=true)..."
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
echo "  ./pull_runpod_results.sh \"$JOB_ID\" --out ."
echo ""
echo "Or: curl -s -H \"Authorization: Bearer \$RUNPOD_API_KEY\" \"https://api.runpod.ai/v2/${ENDPOINT}/status/${JOB_ID}\" > status.json"
echo "    python3 pull_runpod_output.py status.json --out ."
