# gar — archived / no longer needed

Files moved here to keep the repo root clean. Safe to delete this folder or its contents.

- **Generated modules** — Old RunPod/local output (module-*, physics-001, test-5q, test-completion, test-eval). Regenerate with `python generate.py "problem" --id my-module` or via RunPod.
- **Optional scripts** — Pull and test helpers; run from repo root as `./gar/pull_runpod_results.sh`, `./gar/test_runpod.sh`, etc., or copy back to root if you prefer.
  - `pull_from_supabase.py` — Pull a module from Supabase Storage.
  - `pull_runpod_output.py` — Extract module/artifacts from a RunPod status JSON.
  - `pull_runpod_results.sh` — Fetch RunPod job status and extract output.
  - `test_runpod.sh` — POST one problem to RunPod.
  - `test_runpod_multi.sh` — POST multiple problems to RunPod.
- **last_runpod_job_id.txt** — Local run artifact (if present).
- **evaluation_results/**, **evaluation_results_runpod/**, **recordings/** — Local/RunPod eval output and recordings.
- **status.json**, **status_*.json** — RunPod job status files (from pull scripts).
