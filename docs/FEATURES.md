# Feature Pipelines

One flowchart per feature. Same style as the per-component evaluation pipeline: linear steps, single decision where needed, no extra detail.

---

## Input and job

```mermaid
flowchart LR
    A["Problem statement(s)"] --> B["Parse args or --file"]
    B --> C["module_id + problems[]"]
    C --> D["Create module dirs"]
```

---

## Gemini planning

```mermaid
flowchart TB
    A["Problem text"] --> B["Gemini API: PLANNER_PROMPT"]
    B --> C["Structured JSON"]
    C --> D["problem.title, problem.text"]
    C --> E["steps[]"]
    E --> F["explanation, inputLabel, correctAnswer"]
    E --> G["visualizationType"]
    E --> H["modulePrompt | moduleImage"]
    E --> I["audioExplanation"]
```

---

## Problem-level SVG

```mermaid
flowchart LR
    A["Problem text"] --> B["Build SVG prompt"]
    B --> C["Gemini: generate SVG"]
    C --> D["Write problem-viz-qN.svg"]
```

---

## Step: interactive HTML

```mermaid
flowchart LR
    A["step.modulePrompt"] --> B["Gemini: interactive HTML"]
    B --> C["Write components/qN-step-M.html"]
```

---

## Step: image (SVG diagram)

```mermaid
flowchart LR
    A["step.moduleImage"] --> B["Gemini: SVG diagram"]
    B --> C["Write visuals/qN-step-M.svg"]
```

---

## Step: TTS audio

```mermaid
flowchart LR
    A["step.audioExplanation"] --> B["Rate limit 10/min"]
    B --> C["Gemini TTS API"]
    C --> D["PCM 16-bit 24kHz"]
    D --> E["Write audio/qN-step-M.wav"]
```

---

## Manifest build

```mermaid
flowchart TB
    A["All questions processed"] --> B["Build manifest.json"]
    B --> C["id, questions[], generated, version"]
    C --> D["Paths: components, visuals, audio"]
    D --> E["Write manifest.json"]
```

---

## Per-component evaluation (quality gate)

```mermaid
flowchart LR
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
```

---

## Auto-fix loop

```mermaid
flowchart TB
    A["Score < 70"] --> B["Collect screenshots + current HTML"]
    B --> C["Build fix prompt for Gemini"]
    C --> D["Gemini: return fixed HTML"]
    D --> E["Overwrite component file"]
    E --> F["Re-queue same component"]
    F --> G["Load URL again"]
```

---

## Serve and viewer

```mermaid
flowchart LR
    A["serve.py"] --> B["Static: modules/, index.html"]
    B --> C["module-viewer.html for evaluator"]
    C --> D["index.html?module=id for learner"]
    D --> E["homework-app.js loads manifest"]
    E --> F["Embed components/SVG/audio per step"]
```
