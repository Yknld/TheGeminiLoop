# The Gemini Loop — RunPod Serverless CPU endpoint
# Build: Branch=main, Dockerfile Path=Dockerfile, Build Context=.

FROM python:3.11-slim

WORKDIR /app

# Install Python deps (no Chromium; use evaluate=false on CPU to keep image small)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app (modules/ can be empty; generated at runtime)
COPY generate.py evaluate_loop_clean.py run_evaluator_queue.py ./
COPY serve.py index.html module-viewer.html homework-app.js homework-styles.css ./
COPY modules ./modules

# RunPod serverless entrypoint
COPY rp_handler.py .
CMD ["python", "-u", "rp_handler.py"]
