# The Gemini Loop: Overview

AI-powered interactive homework modules with closed-loop quality assurance. The system turns problem statements into step-by-step study modules: Gemini produces a plan, then generates interactive HTML, SVG diagrams, and optional TTS audio. An evaluation loop runs in a real browser, scores each component with Gemini Vision, and auto-fixes failures until the module passes or max attempts are reached.

## How it works

1. **Input.** You provide one or more problem statements (CLI args or `--file questions.txt`). The job is a module ID plus a list of problems.

2. **Planning.** Gemini is called with a fixed prompt to produce a structured JSON plan: problem title/text and a list of steps. Each step has explanation, input label, correct answer, visualization type (interactive or image), and either a module prompt (for interactive HTML) or an image description (for SVG). Optional audio explanation text is used for TTS.

3. **Asset generation.** For each question, a problem-level SVG is generated. For each step, depending on type:
   - Interactive: Gemini generates an HTML component (sliders, inputs, graphs).
   - Image: Gemini generates an SVG diagram.
   - Audio: Gemini TTS generates a WAV file (rate-limited to 10 requests per minute).

4. **Manifest.** A single `manifest.json` (v2.0) lists all questions and steps with paths to components, visuals, and audio.

5. **Evaluation (optional).** With `--evaluate`, each interactive component is loaded in a headless browser. The evaluator finds controls, executes interactions, takes screenshots, and sends them to Gemini Vision for a score and issue list. If the score is below threshold, a fix prompt is built and Gemini returns fixed HTML; the file is overwritten and the component is re-tested. The loop continues until pass or max attempts.

6. **Output.** The module is written under `modules/<module_id>/`. You serve it with `serve.py` and open `index.html?module=<id>` for the learner. The evaluator uses `module-viewer.html` to load a single component in isolation.

## Repository layout

- `generate.py`: entry point; Gemini planning and asset generation.
- `run_evaluator_queue.py`: queues components for evaluation when `--evaluate` is set.
- `evaluate_loop_clean.py`: browser automation, Gemini Vision scoring, and auto-fix.
- `serve.py`: local HTTP server for modules and module-viewer.
- `index.html`, `homework-app.js`, `homework-styles.css`: learner UI.
- `module-viewer.html`: single-component view for the evaluator.
- `docs/`: architecture, evaluation, integration, RunPod, and per-feature flowcharts.

## Documentation index

- [OVERVIEW.md](./OVERVIEW.md) — this file.
- [FEATURES.md](./FEATURES.md) — one flowchart per feature (planning, SVG, HTML, TTS, manifest, evaluation, serve).
- [ARCHITECTURE.md](./ARCHITECTURE.md) — diagrams and pipeline details.
- [EVALUATION.md](./EVALUATION.md) — evaluator and fix loop.
- [INTEGRATION.md](./INTEGRATION.md) — Supabase and RunPod integration.
- [RUNPOD.md](./RUNPOD.md) — RunPod deployment, env vars, request/response.
