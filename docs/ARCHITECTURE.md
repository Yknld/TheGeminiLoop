# Architecture

## Pipeline stages

1. **Input** — Problem text(s) (CLI args, `--file`, or from an external job payload).
2. **Planning** — Single Gemini call with a structured prompt; output is JSON: `problem` + `steps[]` with explanations, input labels, correct answers, visualization type (`interactive` | `image`), and either `modulePrompt` or `moduleImage`.
3. **Asset generation** — For each step:
   - **Interactive**: Gemini generates self-contained HTML (inline CSS/JS) from `modulePrompt`; saved as `components/qN-step-M.html`.
   - **Image**: Gemini generates SVG from `moduleImage`; saved as `visuals/qN-step-M.svg`.
   - **Audio** (optional): `audioExplanation` sent to Supabase TTS; saved as `audio/qN-step-M.mp3`.
   - Problem-level SVG from problem text → `problem-viz-qN.svg`.
4. **Manifest** — `manifest.json` (v2.0) lists all questions and steps with paths to components, visuals, and audio.
5. **Evaluation loop** (optional, `--evaluate`) — For each interactive component: load in browser, interact, screenshot, score with Gemini Vision, fix if score < 70, retry up to max attempts.
6. **Output** — Static tree under `modules/<module_id>/`; served by `serve.py` and consumed by `index.html` and `module-viewer.html`.

## Data flow

- **Manifest** is the single source of truth for the app: question count, step count, per-step paths and types.
- **module-viewer.html** is used only by the evaluator: it loads one component (or one SVG) per URL (`?module=&question=&step=`).
- **index.html** loads the full manifest and embeds components/visuals per step for the learner.

## Dependencies

- **Gemini API**: planning, HTML generation, SVG generation, vision scoring, and fix generation.
- **Supabase**: TTS for audio (optional).
- **Browser**: Chrome/Chromium for evaluation (and BrowserUse MCP if using that client).
