# RunPod CPU endpoint

## Configure GitHub repository (RunPod UI)

Use these values when connecting the repo:

| Field | Value |
|-------|--------|
| **Branch** | `main` |
| **Dockerfile Path** | `Dockerfile` |
| **Build Context** | `.` |
| **Credentials** | No credentials (unless the repo or base image is private) |

The container runs `handler.py`, which calls `runpod.serverless.start()` (RunPod’s queue-based endpoint expects this). The real logic lives in `rp_handler.py`.

## Environment / secrets

Set these in the RunPod endpoint or template so generation works:

- `GEMINI_API_KEY` — Gemini API key (required for planning, HTML, SVG, vision).
- `SUPABASE_URL` — Supabase project URL (optional; for TTS audio).
- `SUPABASE_KEY` — Supabase anon/service key (optional; for TTS).

`generate.py` reads these from the process environment if set; otherwise it uses in-script defaults.

## Request format

**POST** to the endpoint with JSON body:

```json
{
  "input": {
    "problem_texts": [
      "Solve for x: 2x + 5 = 13",
      "What is the area of a circle with radius 5?"
    ],
    "module_id": "optional-custom-id",
    "evaluate": false
  }
}
```

- **problem_texts** (required): list of problem strings.
- **module_id** (optional): module id; default = `module-<job_id>`.
- **evaluate** (optional): if `true`, run the browser evaluation loop (requires Chromium in the image; default `false` for CPU-only image).

## Response

Success:

```json
{
  "status": "ready",
  "module_id": "algebra-001",
  "manifest_path": "modules/algebra-001/manifest.json",
  "question_count": 2,
  "version": "2.0"
}
```

Failure:

```json
{
  "status": "failed",
  "module_id": "...",
  "error": "Error message"
}
```

## Notes

- The CPU Docker image does **not** include Chromium, so `evaluate: true` will fail unless you use a custom image with Chrome/Chromium and the evaluation dependencies.
- For generation-only (no evaluation), use `evaluate: false` (default). Output is written under `modules/<module_id>/` inside the container; to persist or serve it, add a step that uploads that folder to Supabase Storage (or another store) and return the storage path in the response.
