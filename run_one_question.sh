#!/usr/bin/env bash
# Run TheGeminiLoop for a single question (no evaluation). Logs stream until complete.
# Requires GEMINI_API_KEY in environment or in .env

set -e
cd "$(dirname "$0")"

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

if [ -z "$GEMINI_API_KEY" ] && [ -z "$GOOGLE_AI_STUDIO_API_KEY" ]; then
  echo "Set GEMINI_API_KEY (or GOOGLE_AI_STUDIO_API_KEY) in .env or export it, then run:"
  echo "  ./run_one_question.sh"
  echo "Or: GEMINI_API_KEY=your_key ./run_one_question.sh"
  exit 1
fi

QUESTION="${1:-Solve for x: 2x + 5 = 13}"
MODULE_ID="${2:-tts-test}"

# Use project venv if present (has requests, google-genai, etc.)
if [ -d .venv ]; then
  PYTHON=".venv/bin/python3"
else
  PYTHON="python3"
fi

echo "Question: ${QUESTION:0:60}..."
echo "Module ID: $MODULE_ID"
echo ""

$PYTHON generate.py "$QUESTION" --id "$MODULE_ID" --no-evaluate

echo ""
echo "Done. Output in modules/$MODULE_ID/ (audio in modules/$MODULE_ID/audio/)"
