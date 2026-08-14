#!/bin/bash
set -e

# Render nginx config from template — only substitutes the vars named here,
# leaving nginx's own $variables (like $host, $remote_addr) untouched.
# nginx serves static files only; backend calls go browser -> gateway -> backend.
envsubst '${BACKEND_URL}' \
    < /etc/nginx/templates/default.conf.template \
    > /etc/nginx/conf.d/default.conf

# The backend rejects every /api/v1 call without this, and it is what the
# gateway must send as X-API-Key — fail fast rather than 401 every request.
if [ -z "${INTERNAL_API_TOKEN:-}" ]; then
    echo "ERROR: INTERNAL_API_TOKEN is not set. Add it to your .env / -e flags." >&2
    exit 1
fi

# Docker --env-file cannot handle multi-line PEM certs.
# If a cert file is mounted, append SCYLLA_CA_CERT to the .env that pydantic-settings
# reads — python-dotenv supports multi-line values wrapped in double quotes.
if [ -n "${SCYLLA_CA_CERT_FILE:-}" ]; then
    if [ ! -f "${SCYLLA_CA_CERT_FILE}" ]; then
        echo "ERROR: SCYLLA_CA_CERT_FILE='${SCYLLA_CA_CERT_FILE}' not found. Mount it with -v." >&2
        exit 1
    fi
    printf 'SCYLLA_CA_CERT="%s"\n' "$(cat "${SCYLLA_CA_CERT_FILE}")" \
        >> /app/scylla-service/.env
    echo "Wrote CA cert into /app/scylla-service/.env from ${SCYLLA_CA_CERT_FILE}"
fi

echo "Starting FastAPI backend on ${APP_HOST:-0.0.0.0}:${APP_PORT:-8000} ..."
cd /app/scylla-service
uvicorn app.main:app \
    --host "${APP_HOST:-0.0.0.0}" \
    --port "${APP_PORT:-8000}" &
BACKEND_PID=$!

echo "Starting nginx (frontend) on port 80 ..."
nginx -g 'daemon off;' &
NGINX_PID=$!

# Exit the container if either process dies
wait -n $BACKEND_PID $NGINX_PID
EXIT_CODE=$?

kill $BACKEND_PID $NGINX_PID 2>/dev/null || true
wait
exit $EXIT_CODE
