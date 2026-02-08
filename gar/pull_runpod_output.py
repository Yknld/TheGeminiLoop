#!/usr/bin/env python3
"""
Extract module zip, evaluation results, and artifacts (screenshots + recording)
from a RunPod completed job response.

Usage:
  # From a saved response JSON file (output of GET .../status/{job_id})
  python pull_runpod_output.py response.json

  # Or pipe the response
  curl -s -H "Authorization: Bearer $RUNPOD_API_KEY" "https://api.runpod.ai/v2/$RUNPOD_ENDPOINT/status/$JOB_ID" | python pull_runpod_output.py -

  # Optional: output directory (default: current dir)
  python pull_runpod_output.py response.json --out ./my_run
"""

import argparse
import base64
import json
import sys
import zipfile
from pathlib import Path


def main():
    ap = argparse.ArgumentParser(description="Extract module and artifacts from RunPod job output")
    ap.add_argument("input", help="Path to JSON file with job output, or '-' for stdin")
    ap.add_argument("--out", "-o", default=".", help="Output directory (default: current dir)")
    args = ap.parse_args()

    if args.input == "-":
        data = json.load(sys.stdin)
    else:
        with open(args.input) as f:
            data = json.load(f)

    # RunPod status response has output in data["output"]
    if "output" in data:
        out = data["output"]
    else:
        out = data

    if out.get("status") == "failed":
        print("Job failed:", out.get("error", "unknown"), file=sys.stderr)
        # Still extract evaluation_results and artifacts if present (e.g. Supabase failed but screenshots saved)

    module_id = out.get("module_id", "module-unknown")
    base = Path(args.out)
    base.mkdir(parents=True, exist_ok=True)

    # 1. Module zip
    module_extracted = False
    if "module_zip_base64" in out and "module_zip_filename" in out:
        zip_path = base / out["module_zip_filename"]
        zip_path.write_bytes(base64.b64decode(out["module_zip_base64"]))
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(base)
        print(f"Module: {zip_path} -> extracted under {base}")
        zip_path.unlink()  # remove zip after extract
        module_extracted = True
    else:
        reason = out.get("module_zip_skipped") or "module may be too large"
        print(f"No module zip in output: {reason}", file=sys.stderr)
        print("  To get the module: run the job with user_id/lesson_id to push to Supabase, then pull_from_supabase.py; or run with fewer problem_texts so the zip fits.", file=sys.stderr)

    # 2. Evaluation results JSON
    if "evaluation_results_json" in out:
        eval_dir = base / "evaluation_results" / f"{module_id}_queue"
        eval_dir.mkdir(parents=True, exist_ok=True)
        (eval_dir / "evaluation_results.json").write_text(out["evaluation_results_json"])
        print(f"Evaluation results: {eval_dir / 'evaluation_results.json'}")

    # 3. Artifacts zip (screenshots + recording)
    if "artifacts_zip_base64" in out and "artifacts_zip_filename" in out:
        zip_path = base / out["artifacts_zip_filename"]
        zip_path.write_bytes(base64.b64decode(out["artifacts_zip_base64"]))
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(base)
        print(f"Artifacts (screenshots + recording): {zip_path} -> extracted under {base}")
        zip_path.unlink()
    else:
        print("No artifacts_zip_base64 in output", file=sys.stderr)

    print()
    if module_extracted:
        print(f"Done. Module: {base / 'modules' / module_id}")
        print(f"  View: cd TheGeminiLoop && python3 serve.py && open http://localhost:8000/index.html?module={module_id}")
    else:
        print(f"Done (no module zip). module_id: {module_id}")
        print("  Evaluation results and artifacts (if any) were extracted. Module was not included (too large).")
    rec_path = base / "recordings" / module_id / "evaluation.webm"
    if rec_path.exists() or "artifacts_zip_base64" in out:
        print(f"  Recording: {rec_path}")

    if out.get("status") == "failed":
        sys.exit(1)


if __name__ == "__main__":
    main()
