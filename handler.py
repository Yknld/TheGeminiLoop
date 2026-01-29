#!/usr/bin/env python3
"""
RunPod queue-based endpoint entrypoint.
RunPod validator looks for serverless.runpod.start() in default branch.
Actual call below: runpod.serverless.start(). Delegates to rp_handler.
"""
import runpod
from rp_handler import handler

runpod.serverless.start({"handler": handler})
