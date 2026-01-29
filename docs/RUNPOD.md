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

- `GEMINI_API_KEY` — Gemini API key (required for planning, HTML, SVG, vision, **and TTS**). Same key is used for Gemini TTS (step audio).
- `GEMINI_TTS_VOICE` — (optional) Gemini TTS voice name, e.g. `Kore`, `Puck`, `Zephyr`. Default: `Kore`.
- `GEMINI_TTS_MODEL` — (optional) TTS model; default: `gemini-2.5-flash-preview-tts`.

Step audio is generated with **Gemini TTS** and saved as **WAV** (`audio/qN-step-M.wav`). No Supabase needed for audio.

## Long-running jobs (don’t use `/runsync`)

Generation can take **2–10+ minutes** (Gemini planning + steps × HTML/SVG/TTS). RunPod’s `/runsync` often times out (e.g. 90s), so the client may “hang” or time out while the worker is still running.

**Use `/run` and poll for status:**

1. **POST** to `https://api.runpod.ai/v2/{endpoint_id}/run` with the same `input` JSON.
2. Response: `{"id": "job-uuid", "status": "IN_QUEUE", ...}`.
3. **Poll** `GET https://api.runpod.ai/v2/{endpoint_id}/status/{job_id}` (with `Authorization: Bearer YOUR_API_KEY`) until `status` is `COMPLETED` or `FAILED`.
4. When `COMPLETED`, the response includes the handler output (e.g. `status: "ready"`, `module_id`, etc.).

Worker logs will now stream `generate.py` output so you see “Calling Gemini…”, “Step 1…”, etc., instead of a silent hang.

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
