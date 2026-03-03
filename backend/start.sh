#!/usr/bin/env sh
set -eu

celery -A backend.worker.celery_app.celery worker --pool=solo --loglevel="${CELERY_LOG_LEVEL:-info}" &
CELERY_PID=$!
WEB_PID=""

cleanup() {
  if [ -n "$WEB_PID" ]; then
    kill "$WEB_PID" 2>/dev/null || true
  fi
  kill "$CELERY_PID" 2>/dev/null || true
}

trap cleanup INT TERM

gunicorn backend.main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --workers "${WEB_CONCURRENCY:-1}" \
  --bind "0.0.0.0:${PORT:-10000}" \
  --timeout "${GUNICORN_TIMEOUT:-120}" &
WEB_PID=$!

WEB_STATUS=0
if wait "$WEB_PID"; then
  WEB_STATUS=0
else
  WEB_STATUS=$?
fi

kill "$CELERY_PID" 2>/dev/null || true
wait "$CELERY_PID" || true

exit "$WEB_STATUS"
