# ── Stage 1: build the Vite/React frontend ───────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /build

COPY scylla-fe/package.json scylla-fe/package-lock.json ./
RUN npm ci

COPY scylla-fe/ ./

# Gateway config is inlined into the bundle at build time. The local-mode vars
# (VITE_LOCAL_API_KEY / _URL) are deliberately NOT passed, so a deployed image
# can never carry a local API key in its public JS.
ARG APP_ENV=production
ARG PARENT_ORIGIN
ARG MIDDLEWARE_BASE_URL
ARG SCYLLA_VISUALIZER_GATEWAY
ARG GATEWAY_WS_URL

# A local-mode build ships an auth bypass — refuse to produce one.
RUN if [ "$APP_ENV" = "local" ]; then \
        echo "ERROR: refusing to build with APP_ENV=local — local builds must never be deployed." >&2; \
        exit 1; \
    fi

ENV VITE_APP_ENV=$APP_ENV \
    VITE_PARENT_ORIGIN=$PARENT_ORIGIN \
    VITE_MIDDLEWARE_BASE_URL=$MIDDLEWARE_BASE_URL \
    VITE_SCYLLA_VISUALIZER_GATEWAY=$SCYLLA_VISUALIZER_GATEWAY \
    VITE_GATEWAY_WS_URL=$GATEWAY_WS_URL

RUN npm run build


# ── Stage 2: runtime image (FastAPI + nginx) ─────────────────────────────────
FROM python:3.10-slim

# nginx + envsubst (gettext-base) for nginx.conf.template substitution
RUN apt-get update && apt-get install -y --no-install-recommends \
        nginx \
        gettext-base \
    && rm -rf /var/lib/apt/lists/*

# ── Backend ───────────────────────────────────────────────────────────────────
WORKDIR /app/scylla-service

COPY scylla-service/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY scylla-service/ ./

# ── Frontend static build served by nginx ────────────────────────────────────
COPY --from=frontend-builder /build/dist /usr/share/nginx/html

# Template is rendered at container start so BACKEND_URL stays runtime-dynamic
COPY scylla-fe/nginx.conf.template /etc/nginx/templates/default.conf.template

# Remove debian's default nginx site
RUN rm -f /etc/nginx/sites-enabled/default

# ── TLS certificate (optional — only copied if present in build context) ──────
COPY cert.pem /certs/ca.pem

# ── Startup script ────────────────────────────────────────────────────────────
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# ── Defaults for required vars (all overridable via --env-file .env) ─────────
# Backend is always on localhost inside this container — BACKEND_URL is the
# only value that truly never needs changing in a single-container deployment.
ENV APP_HOST=0.0.0.0 \
    APP_PORT=8000 \
    APP_ENV=production \
    LOG_LEVEL=INFO \
    BACKEND_URL=http://localhost:8000

EXPOSE 80 8000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
