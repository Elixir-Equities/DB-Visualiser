# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build

# ── Stage 2: serve ────────────────────────────────────────────────────────────
FROM nginx:alpine

# Remove the default nginx site
RUN rm /etc/nginx/conf.d/default.conf

# The official nginx image processes /etc/nginx/templates/*.template
# with envsubst at startup, writing results to /etc/nginx/conf.d/
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

# nginx entrypoint handles envsubst automatically before starting nginx
CMD ["nginx", "-g", "daemon off;"]
