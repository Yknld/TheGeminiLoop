# The Gemini Loop — RunPod Serverless CPU endpoint
# Build: Branch=main, Dockerfile Path=Dockerfile, Build Context=.

# Playwright needs more system libs than slim provides
FROM python:3.11-bullseye

WORKDIR /app

# Playwright Chromium system dependencies + Xvfb for virtual display
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libdbus-1-3 libatspi2.0-0 libx11-6 libxcomposite1 libxdamage1 libxext6 \
    libxfixes3 libxrandr2 libgbm1 libxcb1 libxkbcommon0 libpango-1.0-0 \
    libcairo2 libasound2 fonts-liberation wget ca-certificates \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Playwright browsers (not system Chromium)
RUN playwright install chromium \
    && playwright install-deps chromium || true

ENV PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright
ENV DISPLAY=:99

# App code
COPY generate.py evaluate_loop_clean.py run_evaluator_queue.py ./
COPY serve.py index.html module-viewer.html homework-app.js homework-styles.css ./
COPY modules ./modules

# Local package: qa_browseruse_mcp (found via sys.path in evaluate_loop_clean.py, no pip install)
COPY qa_browseruse_mcp ./qa_browseruse_mcp

COPY rp_handler.py handler.py ./

# Entrypoint starts Xvfb before running handler (non-headless browser for reliable screenshots)
RUN echo '#!/bin/bash\nXvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset &\nsleep 2\nexec "$@"' > /entrypoint.sh && chmod +x /entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["/entrypoint.sh"]
CMD ["python", "-u", "handler.py"]
