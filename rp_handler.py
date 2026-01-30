#!/usr/bin/env python3
"""
RunPod Serverless CPU endpoint handler for The Gemini Loop.

Expects job input:
  - problem_texts: list of problem strings (required)
  - user_id: uuid (required if pushing to Supabase)
  - lesson_id: uuid (required if pushing to Supabase)
  - module_id: optional; default = "module-<timestamp>"
  - evaluate: optional bool; default False (skip browser evaluation to keep CPU image small)
  - push_to_supabase: optional bool; default True if user_id/lesson_id provided

Returns:
  - module_id, status "ready" | "failed", manifest_path, error (if failed)
  - If push_to_supabase and user_id/lesson_id: uploads to lesson_assets, upserts lesson_outputs
  - If ready and module small enough: module_zip_base64, module_zip_filename, launch_instructions
"""

import os
import sys
import json
import subprocess
import zipfile
import base64
import io
import time
import socket
import runpod
from pathlib import Path

PORT = 8000
SERVER_WAIT_TIMEOUT = 15
SERVER_POLL_INTERVAL = 0.5

# RunPod response size limit ~10MB; base64 adds ~33%; keep zip under 6MB
MAX_ZIP_BYTES = 6 * 1024 * 1024

BUCKET = "lesson_assets"
STORAGE_PREFIX = "interactive_pages"


def _upload_module_to_supabase(module_dir: Path, module_id: str, user_id: str, lesson_id: str) -> dict:
    """Upload module files to Supabase Storage and upsert lesson_outputs. Returns content_json for lesson_outputs."""
    try:
        from supabase import create_client
    except ImportError:
        return {"error": "supabase package not installed"}
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        return {"error": "SUPABASE_URL and SUPABASE_SERVICE_KEY required for push"}
    client = create_client(url, key)
    storage_prefix = f"{user_id}/{lesson_id}/{STORAGE_PREFIX}/{module_id}"
    uploaded = []
    for f in module_dir.rglob("*"):
        if not f.is_file():
            continue
        rel = f.relative_to(module_dir)
        path = f"{storage_prefix}/{rel.as_posix()}"
        content = f.read_bytes()
        mime = "application/octet-stream"
        if f.suffix == ".json":
            mime = "application/json"
        elif f.suffix == ".html":
            mime = "text/html"
        elif f.suffix == ".svg":
            mime = "image/svg+xml"
        elif f.suffix == ".wav":
            mime = "audio/wav"
        try:
            client.storage.from_(BUCKET).upload(path, content, {"content-type": mime, "upsert": True})
            uploaded.append(path)
        except Exception as e:
            return {"error": f"upload {path}: {e}"}
    manifest_path = module_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    content_json = {
        "module_id": module_id,
        "storage_prefix": storage_prefix,
        "question_count": len(manifest.get("questions", [])),
        "version": manifest.get("version"),
    }
    row = {
        "user_id": user_id,
        "lesson_id": lesson_id,
        "type": "interactive_pages",
        "status": "ready",
        "content_json": content_json,
    }
    try:
        sel = client.table("lesson_outputs").select("id").eq("lesson_id", lesson_id).eq("type", "interactive_pages").eq("user_id", user_id).execute()
        if sel.data and len(sel.data) > 0:
            client.table("lesson_outputs").update({"status": "ready", "content_json": content_json}).eq("id", sel.data[0]["id"]).execute()
        else:
            client.table("lesson_outputs").insert(row).execute()
    except Exception as e:
        return {"error": f"lesson_outputs upsert: {e}", "content_json": content_json}
    return content_json


def handler(job):
    job_input = job.get("input") or {}
    problem_texts = job_input.get("problem_texts")
    if not problem_texts:
        return {"error": "Missing 'problem_texts'. Pass a list of problem strings."}
    if isinstance(problem_texts, str):
        problem_texts = [problem_texts]
    module_id = job_input.get("module_id") or f"module-{job.get('id', 'run')}"
    evaluate = job_input.get("evaluate", False)
    user_id = job_input.get("user_id") or ""
    lesson_id = job_input.get("lesson_id") or ""
    push_to_supabase = job_input.get("push_to_supabase", bool(user_id and lesson_id))

    runpod.serverless.progress_update(job, "Starting generation...")
    workdir = Path(__file__).resolve().parent
    modules_dir = workdir / "modules"
    modules_dir.mkdir(exist_ok=True)

    serve_proc = None
    if evaluate:
        os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/root/.cache/ms-playwright")
        runpod.serverless.progress_update(job, "Starting HTTP server for evaluation...")
        serve_proc = subprocess.Popen(
            [sys.executable, "-u", str(workdir / "serve.py")],
            cwd=str(workdir),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        deadline = time.monotonic() + SERVER_WAIT_TIMEOUT
        while time.monotonic() < deadline:
            try:
                with socket.create_connection(("127.0.0.1", PORT), timeout=1):
                    break
            except (socket.error, OSError):
                time.sleep(SERVER_POLL_INTERVAL)
        else:
            if serve_proc.poll() is None:
                serve_proc.terminate()
                serve_proc.wait(timeout=5)
            return {"status": "failed", "module_id": module_id, "error": f"HTTP server did not bind to port {PORT} in {SERVER_WAIT_TIMEOUT}s"}

    cmd = [sys.executable, "-u", str(workdir / "generate.py"), "--id", module_id]
    for p in problem_texts:
        cmd.append(p)
    if evaluate:
        cmd.append("--evaluate")

    try:
        runpod.serverless.progress_update(job, "Running generate.py (this can take 2–10+ min)...")
        proc = subprocess.Popen(
            cmd,
            cwd=str(workdir),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env={**os.environ, "RUNPOD": "1"} if evaluate else os.environ,
        )
        try:
            for line in proc.stdout:
                print(line, end="", flush=True)
            proc.wait(timeout=1800)
        finally:
            if serve_proc is not None and serve_proc.poll() is None:
                serve_proc.terminate()
                try:
                    serve_proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    serve_proc.kill()
        if proc.returncode != 0:
            return {
                "status": "failed",
                "module_id": module_id,
                "error": "generate.py exited with non-zero code",
            }
        manifest_path = modules_dir / module_id / "manifest.json"
        if not manifest_path.exists():
            return {
                "status": "failed",
                "module_id": module_id,
                "error": "manifest.json not found after generation",
            }
        manifest = json.loads(manifest_path.read_text())
        module_dir = modules_dir / module_id
        out = {
            "status": "ready",
            "module_id": module_id,
            "manifest_path": f"modules/{module_id}/manifest.json",
            "question_count": len(manifest.get("questions", [])),
            "version": manifest.get("version"),
            "launch_instructions": (
                "Download the module zip (see module_zip_base64 below if present), "
                "unzip into TheGeminiLoop/modules/, then run: python serve.py and open "
                f"http://localhost:8000/index.html?module={module_id}"
            ),
        }
        if push_to_supabase and user_id and lesson_id:
            runpod.serverless.progress_update(job, "Pushing module to Supabase...")
            result = _upload_module_to_supabase(module_dir, module_id, user_id, lesson_id)
            if "error" in result:
                out["supabase_error"] = result["error"]
            else:
                out["storage_prefix"] = result.get("storage_prefix")
                out["pushed_to_supabase"] = True
        # Zip module (if under size limit)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in module_dir.rglob("*"):
                if f.is_file():
                    arcname = Path("modules") / module_id / f.relative_to(module_dir)
                    zf.write(f, arcname)
        zip_bytes = buf.getvalue()
        if len(zip_bytes) <= MAX_ZIP_BYTES:
            out["module_zip_base64"] = base64.b64encode(zip_bytes).decode("ascii")
            out["module_zip_filename"] = f"{module_id}.zip"
            out["launch_instructions"] = (
                f"1. Decode module_zip_base64 to {module_id}.zip and save. "
                "2. Unzip into your TheGeminiLoop repo root (zip contains modules/<id>/). "
                "3. In repo run: python serve.py. "
                f"4. Open: http://localhost:8000/index.html?module={module_id}"
            )
        else:
            out["module_zip_skipped"] = f"Module zip exceeds {MAX_ZIP_BYTES // (1024*1024)}MB; not included. Use storage upload or run generation locally."
        return out
    except subprocess.TimeoutExpired:
        return {"status": "failed", "module_id": module_id, "error": "Generation timed out (30m)"}
    except Exception as e:
        return {"status": "failed", "module_id": module_id, "error": str(e)}


runpod.serverless.start({"handler": handler})
