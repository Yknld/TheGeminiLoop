# The Gemini Loop

**AI-powered interactive homework modules with closed-loop quality assurance.**

Generate step-by-step study modules from any problem statement. The system plans with Gemini, produces interactive HTML + SVG + audio, then **validates every component in a real browser** and **auto-fixes failures** until the module is production-ready. Zero runtime AI—everything is pre-generated and tested.

---

## Architecture Overview

```mermaid
flowchart TB
    subgraph INPUT["⌇ INPUT LAYER ⌇"]
        P[("Problem Statement(s)")]
        F[("--file questions.txt")]
        P --> J
        F --> J
        J{{"Job: module_id + problems[]"}}
    end

    subgraph PLANNING["⌇ GEMINI PLANNING ⌇"]
        J --> API1["Gemini 2.5 Flash API"]
        API1 --> PLAN["Structured JSON Plan"]
        PLAN --> META["problem.title, problem.text"]
        PLAN --> STEPS["steps[]"]
        STEPS --> S1["step.explanation"]
        STEPS --> S2["step.inputLabel / correctAnswer"]
        STEPS --> S3["step.visualizationType"]
        STEPS --> S4["step.modulePrompt | moduleImage"]
        STEPS --> S5["step.audioExplanation"]
    end

    subgraph ASSET_GEN["⌇ ASSET GENERATION ⌇"]
        S3 --> BRANCH{{"Type?"}}
        BRANCH -->|"interactive"| HTML["Gemini → Interactive HTML"]
        BRANCH -->|"image"| SVG["Gemini → SVG Diagram"]
        S5 --> TTS["Supabase TTS → MP3"]
        HTML --> COMP["components/qN-step-M.html"]
        SVG --> VIS["visuals/qN-step-M.svg"]
        TTS --> AUD["audio/qN-step-M.mp3"]
        META --> PVIZ["Problem-level SVG"]
    end

    subgraph MANIFEST["⌇ MANIFEST ⌇"]
        COMP --> MF
        VIS --> MF
        AUD --> MF
        PVIZ --> MF
        MF["manifest.json (v2.0)"]
        MF --> PATHS["Paths + metadata for all questions/steps"]
    end

    subgraph EVAL_LOOP["⌇ EVALUATION LOOP ⌇"]
        PATHS --> SERVE["serve.py (localhost:8000)"]
        SERVE --> VIEWER["module-viewer.html?module=&question=&step="]
        VIEWER --> BROWSER["Browser Automation"]
        BROWSER --> ACT["Interact: sliders, inputs, buttons"]
        ACT --> SCREEN["Screenshot(s)"]
        SCREEN --> VISION["Gemini Vision API"]
        VISION --> SCORE["Score 0–100 + issues"]
        SCORE --> PASS{{"Score ≥ 70?"}}
        PASS -->|Yes| DONE["✅ Component passed"]
        PASS -->|No| FIX["Generate fix prompt + screenshots"]
        FIX --> FIX_API["Gemini → Fixed HTML"]
        FIX_API --> WRITE["Overwrite component file"]
        WRITE --> SERVE
        DONE --> NEXT["Next component"]
    end

    subgraph OUTPUT["⌇ OUTPUT LAYER ⌇"]
        NEXT --> BUNDLE["modules/{id}/"]
        BUNDLE --> STATIC["Static site"]
        STATIC --> INDEX["index.html?module=id"]
        INDEX --> LEARNER["Learner"]
    end

    INPUT --> PLANNING
    PLANNING --> ASSET_GEN
    ASSET_GEN --> MANIFEST
    MANIFEST --> EVAL_LOOP
    EVAL_LOOP --> OUTPUT
```

---

## Evaluation Loop (Detail)

The quality gate runs **inside a real browser**. Each interactive component is loaded, exercised, and scored by Gemini Vision. Failures trigger an AI fix and retest; the loop continues until the component passes or max attempts are reached.

```mermaid
flowchart LR
    subgraph PER_COMPONENT["Per-component pipeline"]
        A["Load URL"] --> B["Screenshot initial"]
        B --> C["Find sliders/inputs/buttons"]
        C --> D["Execute interactions"]
        D --> E["Screenshot after"]
        E --> F["Gemini Vision: score + issues"]
        F --> G{Pass?}
        G -->|Yes| H["Done"]
        G -->|No| I["Build fix prompt"]
        I --> J["Gemini: fixed HTML"]
        J --> K["Write file"]
        K --> A
    end
```

```mermaid
sequenceDiagram
    participant Gen as generate.py
    participant Queue as run_evaluator_queue
    participant Eval as ModuleEvaluator
    participant Browser as Headless Chrome
    participant Gemini as Gemini Vision

    Gen->>Queue: --evaluate → enqueue all components
    loop For each component (Q, Step)
        Queue->>Eval: evaluate_component(module_id, step, url)
        Eval->>Browser: Navigate to module-viewer.html
        Eval->>Browser: Query sliders/inputs/buttons
        Eval->>Browser: Dispatch input/change events
        Eval->>Browser: take_screenshot (initial, after_sliders, after_inputs)
        Eval->>Gemini: generate_content([prompt, screenshots])
        Gemini-->>Eval: { score, issues, fix_prompt }
        alt score < 70
            Eval->>Gemini: _auto_fix_component(html + screenshots)
            Gemini-->>Eval: fixed HTML
            Eval->>Eval: apply_fix() → overwrite file
            Note over Eval: Re-queue same component (attempt+1)
        else score ≥ 70
            Eval-->>Queue: passed
        end
    end
    Queue->>Gen: All passed or max attempts → continue
```

---

## System Context (High-Level)

```mermaid
flowchart TB
    subgraph EXTERNAL["External Services"]
        GEM["Gemini API\n(Planning + HTML + SVG + Vision)"]
        SUP["Supabase\n(TTS Edge Function)"]
    end

    subgraph CORE["The Gemini Loop"]
        direction TB
        subgraph GEN["Generation"]
            GP[generate.py]
            GP --> GM[Gemini planning]
            GP --> GH[HTML generation]
            GP --> GS[SVG generation]
            GP --> GA[Audio generation]
        end
        subgraph EVAL["Evaluation"]
            RQ[run_evaluator_queue.py]
            EL[evaluate_loop_clean.py]
            RQ --> EL
            EL --> BA[Browser automation]
            EL --> GV[Gemini Vision]
        end
        subgraph RUNTIME["Runtime"]
            SR[serve.py]
            IX[index.html + homework-app.js]
            MV[module-viewer.html]
            SR --> IX
            SR --> MV
        end
    end

    GEN --> EVAL
    EVAL --> RUNTIME
    GP --> GEM
    GP --> SUP
    EL --> GEM
```

---

## Quick Start

### 1. Generate a module (with evaluation)

```bash
python3 generate.py "Your problem here" --id module-name --evaluate
```

Example:

```bash
python3 generate.py "Solve for x: 2x + 5 = 13" --id algebra-001 --evaluate
```

The pipeline will:

- Call Gemini to produce a structured plan (steps, explanations, visualization types).
- Generate interactive HTML components and/or SVG diagrams per step.
- Optionally generate TTS audio via Supabase.
- Run the evaluation loop: load each component in a browser, interact, screenshot, score with Gemini Vision, and auto-fix failures until pass or max attempts.
- Write the final bundle to `modules/<module_id>/`.

### 2. Serve and view

```bash
python3 serve.py
```

Open:

- Single module: `http://localhost:8000/index.html?module=algebra-001`
- Multiple modules: `http://localhost:8000/index.html?modules=algebra-001,calculus-002`

---

## Repository layout

```
├── generate.py              # Entry point: Gemini planning + asset generation
├── run_evaluator_queue.py   # Queue-based evaluator (--evaluate)
├── evaluate_loop_clean.py   # Browser automation + Gemini Vision scoring + fix
├── serve.py                 # Local HTTP server for modules + module-viewer
├── index.html               # Main learner UI (loads manifest, embeds components)
├── module-viewer.html       # Isolated single-component view (used by evaluator)
├── homework-app.js          # App logic: loading, navigation, step validation
├── homework-styles.css       # Styles
├── docs/                    # Additional documentation
└── modules/
    └── <module_id>/
        ├── manifest.json    # v2.0: questions[], steps[], paths
        ├── problem-viz-qN.svg
        ├── components/      # qN-step-M.html (interactive)
        ├── visuals/         # qN-step-M.svg (static diagrams)
        └── audio/           # qN-step-M.mp3 (optional)
```

---

## Features

| Feature | Description |
|--------|-------------|
| **Multi-question modules** | One manifest, many questions; each question has multiple steps. |
| **Dual visualization** | Per step: `interactive` (HTML + sliders/graphs) or `image` (SVG). |
| **Closed-loop QA** | Browser automation + Gemini Vision scores each component; failures are fixed and re-tested. |
| **Static output** | No runtime AI; manifest + assets are pre-generated and served as static files. |
| **Math** | LaTeX in content; MathJax in the learner UI. |
| **Audio** | Optional TTS per step via Supabase. |

---

## Configuration

- **Gemini**: Set `GEMINI_API_KEY` (and optionally the API URL) in `generate.py` and in the evaluator (e.g. from `index.html` meta or env).
- **TTS**: Set `SUPABASE_URL` and `SUPABASE_KEY` in `generate.py` for audio.
- **Evaluation**: Requires a browser (Chrome/Chromium) and, if used, the BrowserUse MCP client for automation.

---

## Examples

```bash
# Algebra
python3 generate.py "Solve 3x - 7 = 14" --id algebra-002 --evaluate

# Calculus
python3 generate.py "Find the derivative of x^2 + 3x + 5" --id calculus-001 --evaluate

# Multi-part physics
python3 generate.py "A 2.5 kg block on a 30° incline connected to a 1.5 kg hanging mass via a pulley. Find (a) acceleration, (b) tension, (c) time to fall 3 m" --id physics-001 --evaluate

# Multiple problems (inline or from file)
python3 generate.py "Q1 text" "Q2 text" "Q3 text" --id my-module --evaluate
python3 generate.py --file questions.txt --id my-module --evaluate
```

---

## RunPod CPU endpoint

Build from this repo in RunPod with:

- **Branch:** `main`
- **Dockerfile Path:** `Dockerfile`
- **Build Context:** `.`

See [docs/RUNPOD.md](./docs/RUNPOD.md) for request format, env vars, and response shape.

---

## Docs

- [Architecture and flow](./docs/ARCHITECTURE.md) — diagrams and pipeline details.
- [Evaluation pipeline](./docs/EVALUATION.md) — how the evaluator and fix loop work.
- [Integration (Supabase / RunPod)](./docs/INTEGRATION.md) — tying The Gemini Loop into your backend and deployment.
- [RunPod deployment](./docs/RUNPOD.md) — GitHub config, env vars, request/response.

---

## License

See [LICENSE](./LICENSE) in this repository.
