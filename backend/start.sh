#!/usr/bin/env sh
set -eu

celery -A backend.worker.celery_app.celery worker --pool=solo --loglevel="${CELERY_LOG_LEVEL:-info}" &
CELERY_PID=$!

cleanup() {
  kill "$CELERY_PID" 2>/dev/null || true
}

trap cleanup INT TERM

gunicorn backend.main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --workers "${WEB_CONCURRENCY:-2}" \
  --bind "0.0.0.0:${PORT:-10000}" \
  --timeout "${GUNICORN_TIMEOUT:-120}"

wait "$CELERY_PID"
