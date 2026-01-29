#!/usr/bin/env python3
"""
RunPod Serverless CPU endpoint handler for The Gemini Loop.

Expects job input:
  - problem_texts: list of problem strings (required)
  - module_id: optional; default = "module-<timestamp>"
  - evaluate: optional bool; default False (skip browser evaluation to keep CPU image small)

Returns:
  - module_id, status "ready" | "failed", manifest_path, error (if failed)
"""

import os
import sys
import json
import subprocess
import runpod
from pathlib import Path


def handler(job):
    job_input = job.get("input") or {}
    problem_texts = job_input.get("problem_texts")
    if not problem_texts:
        return {"error": "Missing 'problem_texts'. Pass a list of problem strings."}
    if isinstance(problem_texts, str):
        problem_texts = [problem_texts]
    module_id = job_input.get("module_id") or f"module-{job.get('id', 'run')}"
    evaluate = job_input.get("evaluate", False)

    runpod.serverless.progress_update(job, "Starting generation...")
    workdir = Path(__file__).resolve().parent
    modules_dir = workdir / "modules"
    modules_dir.mkdir(exist_ok=True)

    cmd = [sys.executable, str(workdir / "generate.py"), "--id", module_id]
    for p in problem_texts:
        cmd.append(p)
    if evaluate:
        cmd.append("--evaluate")

    try:
        runpod.serverless.progress_update(job, "Running generate.py...")
        proc = subprocess.run(
            cmd,
            cwd=str(workdir),
            capture_output=True,
            text=True,
            timeout=1800,
        )
        if proc.returncode != 0:
            return {
                "status": "failed",
                "module_id": module_id,
                "error": proc.stderr or proc.stdout or "generate.py failed",
            }
        manifest_path = modules_dir / module_id / "manifest.json"
        if not manifest_path.exists():
            return {
                "status": "failed",
                "module_id": module_id,
                "error": "manifest.json not found after generation",
            }
        manifest = json.loads(manifest_path.read_text())
        return {
            "status": "ready",
            "module_id": module_id,
            "manifest_path": f"modules/{module_id}/manifest.json",
            "question_count": len(manifest.get("questions", [])),
            "version": manifest.get("version"),
        }
    except subprocess.TimeoutExpired:
        return {"status": "failed", "module_id": module_id, "error": "Generation timed out (30m)"}
    except Exception as e:
        return {"status": "failed", "module_id": module_id, "error": str(e)}


runpod.serverless.start({"handler": handler})
