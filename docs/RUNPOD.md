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

**POST** to the endpoint with JSON body. Use **`evaluate`: `true`** to run the evaluator (test and validate components); logs will show "💡 Tip: Add --evaluate flag" if you omit it.

```json
{
  "input": {
    "problem_texts": [
      "Solve for x: 2x + 5 = 13",
      "What is the area of a circle with radius 5?"
    ],
    "module_id": "optional-custom-id",
    "evaluate": true
  }
}
```

- **problem_texts** (required): list of problem strings.
- **module_id** (optional): module id; default = `module-<job_id>`.
- **evaluate** (optional): set to **`true`** to run the browser evaluation loop (same as locally). Default `false`. When `true`, the handler starts `serve.py` on port 8000 before running generation so the evaluator can load `module-viewer.html` at `localhost:8000`; the browser runs headless; the server is stopped after the job. Requires **qa_browseruse_mcp** (in requirements.txt) and Chromium in the image.
- **user_id** (optional): UUID of the user (required for Supabase push).
- **lesson_id** (optional): UUID of the lesson (required for Supabase push). If both `user_id` and `lesson_id` are provided, the handler uploads the module to `lesson_assets/{user_id}/{lesson_id}/interactive_pages/{module_id}/` and upserts `lesson_outputs` with `type = 'interactive_pages'`. Set **SUPABASE_URL** and **SUPABASE_SERVICE_KEY** in the RunPod endpoint env.

**Example curl (evaluator on):**

```bash
curl -X POST "https://api.runpod.ai/v2/YOUR_ENDPOINT_ID/run" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"input":{"problem_texts":["Solve for x: 2x + 5 = 13"],"evaluate":true}}'
```

Or run `./test_runpod.sh` (set `RUNPOD_API_KEY` and `RUNPOD_ENDPOINT`).

**Example curl (with Supabase push):** Replace `USER_UUID` and `LESSON_UUID` with real IDs from your app.

```bash
curl -X POST "https://api.runpod.ai/v2/YOUR_ENDPOINT_ID/run" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"input":{"problem_texts":["Solve for x: 2x + 5 = 13"],"user_id":"USER_UUID","lesson_id":"LESSON_UUID","evaluate":true}}'
```

## Response

Success (with optional zip for small modules):

```json
{
  "status": "ready",
  "module_id": "algebra-001",
  "manifest_path": "modules/algebra-001/manifest.json",
  "question_count": 2,
  "version": "2.0",
  "module_zip_base64": "<base64 string if module ≤6MB>",
  "module_zip_filename": "algebra-001.zip",
  "launch_instructions": "1. Decode ... 2. Unzip into repo root. 3. python serve.py. 4. Open index.html?module=..."
}
```

**To run the module locally:** If the response includes `module_zip_base64`, decode and unzip into your TheGeminiLoop repo root, then run the server and open the URL from `launch_instructions`:

```bash
# Example: save base64 to file, decode, unzip (use the actual base64 from the job output)
echo "<paste module_zip_base64 here>" | base64 -d > module.zip
unzip module.zip -d /path/to/TheGeminiLoop/
cd /path/to/TheGeminiLoop && python serve.py
# Open http://localhost:8000/index.html?module=<module_id>
```

Failure:

```json
{
  "status": "failed",
  "module_id": "...",
  "error": "Error message"
}
```

## Hosting the solver viewer (mobile app)

The mobile app (Study OS) loads the interactive solver in a WebView. You need to host these files from this repo somewhere public and point the app at that URL:

- `solver.html`
- `homework-app.js`
- `homework-styles.css`

**Option: Supabase Storage.** Create a public bucket (e.g. `solver`), upload the three files to the bucket root, then set the app config to the bucket’s public URL, e.g.:

`https://<project-ref>.supabase.co/storage/v1/object/public/solver`

In the Study OS mobile app repo (`smrtr/study-os-mobile`), set `SOLVER_VIEWER_URL` in `apps/mobile/src/config/supabase.ts` to that URL (no trailing slash). The app opens `SOLVER_VIEWER_URL/solver.html?lesson_id=...` in a WebView and injects the user’s Supabase **access token** and Supabase URL into the page (as `window.__SUPABASE_TOKEN__` and `window.__SUPABASE_URL__`). The solver page then uses those to call the `interactive_module_get` Edge Function (which requires a valid JWT) and loads the manifest with signed asset URLs.

## Evaluation on RunPod (same as local)

When `evaluate: true`:

1. **HTTP server** — The handler starts `serve.py` in the background and waits for port 8000 to be ready before running `generate.py`. The evaluator loads `http://localhost:8000/module-viewer.html?module=<id>&question=<q>&step=<s>` and interacts with sliders/inputs/buttons, takes screenshots, and sends them to Gemini for scoring. Failed components are fixed by Gemini and re-queued (same logic as `run_evaluator_queue.py` locally).
2. **Headless browser** — The handler sets `RUNPOD=1` in the environment of the `generate.py` process; the evaluator uses a headless browser when `RUNPOD` is set.
3. **Cleanup** — After `generate.py` exits (success or failure), the handler stops the HTTP server.

Requirements: **qa_browseruse_mcp** is in requirements.txt; the Dockerfile installs Chromium. Same evaluator as local.

## Notes

- With `user_id` and `lesson_id` the handler uploads to Supabase Storage and upserts `lesson_outputs`.
