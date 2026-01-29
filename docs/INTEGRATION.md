# Integration (Supabase / RunPod)

## Where the evaluator runs

The evaluation loop **cannot** run in a Supabase Edge Function: it needs a real browser, long runtime, and local file I/O. It should run on the same machine that runs generation (e.g. RunPod).

## Recommended deployment

1. **Edge function** — Authenticate user, validate `lesson_id`, insert/update `lesson_outputs` with `type = 'interactive_pages'`, `status = 'queued'`. Enqueue a job (e.g. to RunPod or a queue that triggers RunPod).
2. **RunPod (or similar)** — Receives job: `{ lesson_id, user_id, output_id, problem_texts[] }`. Runs `generate.py` with those problems and `--evaluate`. On success: uploads `modules/<module_id>/` to Supabase Storage (e.g. `lesson_assets/{user_id}/{lesson_id}/interactive_pages/<module_id>/`), then calls back to update `lesson_outputs` to `status = 'ready'` and set `content_json` (e.g. `module_id`, `storage_prefix`). On failure: set `status = 'failed'`.
3. **App** — Shows “Interactive practice” for a lesson; when `status === 'ready'`, loads the viewer with manifest and asset URLs (e.g. signed URLs from Storage).

## Storage layout

- **Bucket**: e.g. `lesson_assets`.
- **Prefix**: `{user_id}/{lesson_id}/interactive_pages/{module_id}/`.
- **Contents**: Same as local `modules/<module_id>/` (manifest.json, components/, visuals/, audio/, problem-viz-*.svg).

## API for the viewer

The learner UI needs manifest + URLs for each asset. Options:

- Backend/Edge function that, given `lesson_id` and auth, reads `lesson_outputs` and `content_json`, then returns manifest JSON with each path resolved to a signed URL for that path under the module’s storage prefix.
- Or: backend returns a short-lived signed base URL for the prefix, and the viewer appends relative paths (if your client supports that).

Once the viewer has manifest + URLs, it can reuse the existing Gemini Loop UI (load manifest, fetch each component/visual/audio via the signed URLs).
