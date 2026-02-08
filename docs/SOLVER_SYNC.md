# How the webpage and app pull interactive pages

## Overview

- **Interactive “pages”** are the step visualizations: either **HTML components** (`components/*.html`, loaded in iframes) or **images** (`visuals/*.png`, problem-viz-*.png).
- The **runner** that loads the manifest and these assets is the same in both places: `homework-app.js` (plus `solver.html` / `index.html` and `homework-styles.css`).
- **Content** (manifest, components, visuals, audio) comes from different sources for the standalone loop vs the app.

## 1. GeminiLoop standalone (webpage)

- **Served from:** e.g. `python serve.py` or opening `index.html` with `?module=<module_id>`.
- **Manifest:** Fetched from `modules/<module_id>/manifest.json` (same origin).
- **Assets:** For each step, `homework-app.js` uses `resolveAssetUrl(moduleId, path)`:
  - If `path` is already a full `https?://` URL, it is used as-is (e.g. signed URLs from an API).
  - Otherwise: `modules/<module_id>/<path>`, e.g. `modules/gemini3-test/components/q1-step-0.html`, `modules/gemini3-test/visuals/q1-step-1.png`.
- **Interactive components:** For steps with `step.component`, the app fetches that URL (or path), gets the HTML string, and injects it into an iframe via `iframe.srcdoc = html`.
- **Source of code:** This repo (`GeminiLoop/homework-app.js`, `index.html`, `homework-styles.css`).  
- **Source of content:** This repo’s `modules/<module_id>/` (manifest, components/, visuals/, audio/) produced by `generate.py`.

So the webpage is always “up to date” with **current code** in GeminiLoop; module content is whatever you last generated.

## 2. smrtr web and mobile app

- **Solver URL:**  
  - Web: same-origin `/solver/solver.html?lesson_id=<uuid>` (files from `smrtr/solver/` copied to `dist/solver/` at build).  
  - Mobile: `SOLVER_VIEWER_URL` (e.g. Supabase Storage public `solver/solver.html`) with `?lesson_id=<uuid>`.
- **Manifest and assets:** The solver does **not** read from disk. It reads `lesson_id` from the URL, then:
  1. Calls **`interactive_module_get?lesson_id=<uuid>`** (Supabase Edge Function) with the user’s auth.
  2. The Edge Function loads `lesson_outputs` (type `interactive_pages`, status `ready`) for that lesson, gets `storage_prefix` (e.g. `user_id/lesson_id/interactive_pages/module_id`), downloads `manifest.json` from Storage bucket `lesson_assets`, and replaces every asset path (problem.visualization, step.component, step.visual, step.audio) with **signed URLs** for that bucket.
  3. Returns `{ manifest }` where each of those fields is already a full URL.
- **Loading components:** `homework-app.js` receives this manifest; `resolveAssetUrl(moduleId, step.component)` sees a full URL and returns it unchanged. It then `fetch(step.component)` to get the HTML and sets `iframe.srcdoc = html`. So the **interactive pages** (HTML and images) are pulled from **Supabase Storage** (`lesson_assets`), not from GeminiLoop’s `modules/` folder.
- **Source of code:**  
  - Web: `smrtr/solver/` (homework-app.js, solver.html, homework-styles.css) copied at build.  
  - Mobile: whatever is served at `SOLVER_VIEWER_URL` (typically the same files uploaded to Supabase Storage bucket `solver`).
- **Source of content:** Supabase `lesson_assets` at `storage_prefix` (manifest + components/, visuals/, audio/). Content is uploaded when a lesson’s interactive module is generated (e.g. RunPod job running `generate.py` and then uploading the module).

So the app is “up to date” with **current code** only if `smrtr/solver/` (and, for mobile, the Storage bucket `solver`) is updated from GeminiLoop. The **content** for each lesson is whatever was last uploaded for that lesson.

## Keeping the app in sync with current code

The **single source of truth** for the solver UI and behavior is **GeminiLoop** (this repo). The app uses a **copy** in `smrtr/solver/`. To keep the webpage and app behavior aligned:

1. **Copy from GeminiLoop to smrtr/solver**  
   After changing `homework-app.js`, `homework-styles.css`, or `solver.html` in GeminiLoop, copy them into `smrtr/solver/`:
   ```bash
   cp GeminiLoop/homework-app.js    smrtr/solver/
   cp GeminiLoop/homework-styles.css smrtr/solver/
   cp GeminiLoop/solver.html        smrtr/solver/
   ```

2. **Bump cache** in `smrtr/solver/solver.html` (`?v=` on script and stylesheet).

3. **Deploy**  
   - Web: rebuild and deploy the smrtr app so `dist/solver/` is updated.  
   - Mobile: upload the same three files to Supabase Storage bucket **solver** so `SOLVER_VIEWER_URL` serves the new code.

See also **smrtr/solver/README.md** for where the solver is served and how to update web vs mobile.
