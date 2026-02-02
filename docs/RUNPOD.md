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
- **evaluate** (optional): set to **`true`** to run the browser evaluation loop (same as locally). **Default `true`** (evaluation runs unless you pass `"evaluate": false`). When true, the handler starts `serve.py` on port 8000 before running generation so the evaluator can load `module-viewer.html` at `localhost:8000`; the browser runs **non-headless** under Xvfb (virtual display) for reliable screenshots; the server is stopped after the job. Requires **qa_browseruse_mcp** (in requirements.txt), Chromium, and **xvfb** in the image. Pass `"evaluate": false` to skip evaluation (faster, no screenshots/artifacts).
- **user_id** (optional): UUID of the user for Supabase push. If omitted, the handler uses **RUNPOD_DEFAULT_USER_ID** from the RunPod endpoint env (if set).
- **lesson_id** (optional): UUID of the lesson for Supabase push. If omitted, the handler uses **RUNPOD_DEFAULT_LESSON_ID** from the RunPod endpoint env (if set). If both `user_id` and `lesson_id` are available (from input or env), the handler uploads the module to `lesson_assets/{user_id}/{lesson_id}/interactive_pages/{module_id}/` and upserts `lesson_outputs`. Set **SUPABASE_URL** and **SUPABASE_SERVICE_KEY** (and optionally **RUNPOD_DEFAULT_USER_ID** / **RUNPOD_DEFAULT_LESSON_ID**) in the RunPod endpoint env.

**Supabase schema:** Push to Supabase requires the `lesson_outputs.type` check constraint to include `'interactive_pages'`. In the Study OS mobile repo (`smrtr/study-os-mobile`), run migration **019_add_interactive_pages.sql** on your Supabase project (e.g. `supabase db push` from that repo, or run the migration SQL in the Supabase SQL Editor). Otherwise you get: `new row for relation "lesson_outputs" violates check constraint "lesson_outputs_type_check"`.

**Example curl (evaluator on):**

```bash
curl -X POST "https://api.runpod.ai/v2/YOUR_ENDPOINT_ID/run" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"input":{"problem_texts":["Solve for x: 2x + 5 = 13"],"evaluate":true}}'
```

Or run `./gar/test_runpod.sh` (set `RUNPOD_API_KEY` and `RUNPOD_ENDPOINT`).

**Multiple questions:** The HTML viewer and manifest support multiple questions (Q1, Q2, …). To test with several problems at once, use `./gar/test_runpod_multi.sh` (sends 3 problem_texts) or pass a `problem_texts` array with multiple strings in your POST body. When the job completes, pull with `./gar/pull_runpod_results.sh JOB_ID --out .` and open `http://localhost:8000/index.html?module=<module_id>` to switch between questions in the UI.

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

**To pull the module, evaluation results, and recording:** After the job completes, GET the status (the response includes the handler output). Then run:

```bash
# One-liner: fetch status and extract (uses .env or RUNPOD_API_KEY / RUNPOD_ENDPOINT)
./gar/pull_runpod_results.sh JOB_ID --out .

# Or manually:
curl -s -H "Authorization: Bearer $RUNPOD_API_KEY" "https://api.runpod.ai/v2/$RUNPOD_ENDPOINT/status/$JOB_ID" > status.json
python gar/pull_runpod_output.py status.json --out .
```

**Use the job ID from the run response.** When you call `POST .../run`, the response is `{"id": "job-uuid", "status": "IN_QUEUE", ...}`. Use that **`id`** as JOB_ID for the status URL and for `gar/pull_runpod_results.sh`. The `requestId` in worker logs (e.g. `230fcb4d-...-u2`) is not necessarily the same and can return HTTP 404. If you get **404** when pulling, you either used the wrong ID (use the `id` from the run response) or the job has expired; run a new job and save the `id` from the response so you can pull later.

This creates `modules/<module_id>/`, `evaluation_results/<module_id>_queue/`, and `recordings/<module_id>/evaluation.webm`. Open the recording (e.g. in a browser) to see what the evaluator saw.

**Pull module from Supabase (after push):** If the module was saved to Supabase (e.g. `Module saved to Supabase: user_id/lesson_id/interactive_pages/module_id`), pull it locally with `gar/pull_from_supabase.py` (requires `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`):

```bash
# By full storage prefix
python gar/pull_from_supabase.py "2202c52b-a017-4f1a-8330-24c9eb5224c4/0fed25d6-899d-49c5-89b8-238658cec1be/interactive_pages/module-d9a45632-8268-49a8-b3bd-2b56ff358963-u1"

# Or by user, lesson, module
python gar/pull_from_supabase.py --user 2202c52b-a017-4f1a-8330-24c9eb5224c4 --lesson 0fed25d6-899d-49c5-89b8-238658cec1be --module module-d9a45632-8268-49a8-b3bd-2b56ff358963-u1
```

Evaluator screenshots and `evaluation_results.json` are in the RunPod job output (artifacts zip), not in Supabase. Use `gar/pull_runpod_results.sh JOB_ID` (or GET status and `gar/pull_runpod_output.py`) to get them; they are extracted to `evaluation_results/<module_id>_queue/` and `recordings/<module_id>/evaluation.webm`.

**SSH and file transfer:** The basic RunPod SSH command (`user@ssh.runpod.io`) is a **proxy connection** and does **not** support SCP or SFTP, so you cannot `scp` or `rsync` files through it. For serverless runs, results are only available via the API (use `gar/pull_runpod_results.sh` or `gar/pull_runpod_output.py` with a saved status response). For Pods, use “SSH over exposed TCP” (public IP + port) for SCP/rsync, or use `runpodctl send` on the Pod and `runpodctl receive CODE` locally.

**Manual decode:** If you only have `module_zip_base64`, decode and unzip into your TheGeminiLoop repo root:

```bash
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

## Why evaluation might not run (generation only)

If the job completes with a module but **no evaluation** (no screenshots, no `evaluation_results`, no recording), common causes:

1. **Evaluation threw an exception** — e.g. browser/MCP startup failed, or a bug in the evaluator. The process still exits 0 so the handler returns the module. **Check the RunPod job logs**: you should see `EVALUATION PHASE` followed by `Evaluation failed: <error>` and a full traceback. Fix the underlying error (dependencies, env, or code) and redeploy.
2. **Job/worker timeout** — For multiple questions, generation can take 15–25+ minutes; evaluation adds more. If the RunPod worker or endpoint has a max execution time (e.g. 10–15 min), the process may be killed after generation finishes and before or during evaluation. **Fix**: Increase the endpoint’s max duration in the RunPod dashboard, or run with fewer questions per job. The handler allows up to 30 minutes (`proc.wait(timeout=1800)`); ensure the endpoint limit is at least that if you want evaluation.

After fixing, redeploy the handler and run again. The next failure will log a full traceback when evaluation fails.

**If the log just stops with no error** (e.g. last line is a step separator or “STEP N of M”): the worker was almost certainly killed by RunPod’s max execution time. You will not see “✅ Question N complete!”, “🎉 MODULE GENERATION COMPLETE!”, or “🔍 EVALUATION PHASE” if the process died during generation. Increase the endpoint’s max execution time in the RunPod dashboard (recommended ≥ 30 min for multi-question + evaluation), or run with `evaluate: false` and fewer `problem_texts` per job, then run evaluation locally with `python3 run_evaluator_queue.py <module_id>`.

## Evaluation on RunPod (same as local)

When `evaluate: true`:

1. **HTTP server** — The handler starts `serve.py` in the background and waits for port 8000 to be ready before running `generate.py`. The evaluator loads `http://localhost:8000/module-viewer.html?module=<id>&question=<q>&step=<s>` and interacts with sliders/inputs/buttons, takes screenshots, and sends them to Gemini for scoring. Failed components are fixed by Gemini and re-queued (same logic as `run_evaluator_queue.py` locally).
2. **Non-headless browser (Xvfb)** — The container entrypoint starts Xvfb (`:99`) before the handler; the evaluator runs Chromium non-headless against that virtual display for reliable screenshots and DOM rendering (same behavior as local visible browser).
3. **Cleanup** — After `generate.py` exits (success or failure), the handler stops the HTTP server.

Requirements: **qa_browseruse_mcp** is in requirements.txt; the Dockerfile installs Chromium. Same evaluator as local.

## Notes

- With `user_id` and `lesson_id` the handler uploads to Supabase Storage and upserts `lesson_outputs`.
