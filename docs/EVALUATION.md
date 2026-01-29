# Evaluation pipeline

## Purpose

Ensure every interactive component works before deployment: sliders/inputs/buttons respond, layout is usable, and the step teaches the intended concept. Failures are fixed automatically by Gemini and re-tested.

## Flow

1. **Queue** — `run_evaluator_queue.py` builds a queue of component tasks (one per question/step that has `visualizationType === 'interactive'`).
2. **Per component** — For each task:
   - Navigate browser to `http://localhost:8000/module-viewer.html?module=<id>&question=<q>&step=<s>`.
   - Take initial screenshot.
   - Query DOM for `input[type="range"]`, `input[type="text"]`, `input[type="number"]`, `button`.
   - For sliders: set value to mid-range, dispatch `input`/`change`.
   - For inputs: type a test value; dispatch events.
   - For buttons: click (first few).
   - Take screenshots after interactions.
3. **Score** — Send screenshots + interaction log to Gemini Vision with a rubric (e.g. 30 pts “works”, 30 “usable”, 20 “looks reasonable”, 20 “teaches”). Response: `{ score, feedback, issues, unnecessary_elements, ui_improvements }`.
4. **Pass/fix** — If score ≥ 70: mark passed, next component. If not: build a fix prompt (issues + current HTML + educational context), call Gemini to produce fixed HTML, overwrite the component file, and re-queue the same component (attempt + 1, max 3).
5. **Completion** — When queue is empty (all passed or max attempts), generation continues or exits.

## Requirements

- `serve.py` must be running so the evaluator can hit `localhost:8000`.
- A real browser (Chrome/Chromium); headless is supported.
- Gemini API key with vision and generation access.
- Optional: BrowserUse MCP client if using that integration.

## Outputs

- Screenshots under `evaluation_results/<module_id>_<timestamp>/`.
- `evaluation_results.json` per run with per-step scores and pass/fail.
- Updated component HTML files when fixes are applied.
