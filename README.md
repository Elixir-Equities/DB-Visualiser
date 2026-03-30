# ScyllaScope

A browser-based visualiser for ScyllaDB / Cassandra clusters.
A FastAPI backend exposes the cluster data; a React + Vite frontend renders it — both served from a single Docker container.

---

## Project structure

```
ScyllaScope/
├── scylla-service/      # FastAPI backend (Python 3.10)
│   ├── app/
│   │   ├── api/v1/      # Routers: health, keyspaces, tables, query
│   │   ├── core/        # Config, logging
│   │   ├── db/          # ScyllaDB session
│   │   └── services/    # Business logic
│   └── requirements.txt
├── scylla-fe/           # React + Vite frontend
│   ├── src/
│   └── nginx.conf.template
├── Dockerfile
├── docker-entrypoint.sh
├── cert.pem             # CA certificate (if SSL is required — not committed to git)
├── .env.example
└── .dockerignore
```

---

## Running with Docker (recommended)

### 1. Create your env file

```bash
cp .env.example .env
```

Edit `.env` with your ScyllaDB connection details:

```env
SCYLLA_CONTACT_POINTS=192.168.1.10,192.168.1.11
SCYLLA_PORT=9042
SCYLLA_USERNAME=your_user
SCYLLA_PASSWORD=your_pass
```

> `BACKEND_URL` can stay as `http://localhost:8000` — backend and frontend share the same container.

### 2. SSL / TLS (optional)

If your ScyllaDB cluster requires SSL, place your CA certificate in the project root as `cert.pem` and set the following in `.env`:

```env
SCYLLA_SSL=true
SCYLLA_CA_CERT_FILE=/certs/ca.pem
```

The cert is copied into the image at build time (`/certs/ca.pem`) and written into the backend's config automatically on container start. `cert.pem` is excluded from git via `.gitignore`.

### 3. Build

```bash
docker build -t scyllascope .
```

### 4. Run

```bash
docker run -d \
  --name scyllascope \
  --env-file .env \
  -p 80:80 \
  scyllascope
```

Open [http://localhost](http://localhost) in your browser.
API docs are at [http://localhost:8000/docs](http://localhost:8000/docs).

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `BACKEND_URL` | `http://localhost:8000` | URL nginx proxies `/api/` requests to. Keep as-is for single-container use. |
| `APP_ENV` | `production` | Application environment |
| `APP_HOST` | `0.0.0.0` | uvicorn bind host |
| `APP_PORT` | `8000` | uvicorn bind port |
| `LOG_LEVEL` | `INFO` | Backend log level (`DEBUG` / `INFO` / `WARNING` / `ERROR`) |
| `SCYLLA_CONTACT_POINTS` | `127.0.0.1` | Comma-separated ScyllaDB hostnames or IPs |
| `SCYLLA_PORT` | `9042` | ScyllaDB native transport port |
| `SCYLLA_USERNAME` | _(empty)_ | Authentication username |
| `SCYLLA_PASSWORD` | _(empty)_ | Authentication password |
| `SCYLLA_SSL` | `false` | Enable SSL/TLS |
| `SCYLLA_CA_CERT_FILE` | _(empty)_ | Path to the CA cert inside the container. Set to `/certs/ca.pem` when `cert.pem` is present in the project root at build time. |

---

## Local development

### Backend

```bash
cd scylla-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # edit as needed
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd scylla-fe
npm install
# BACKEND_URL is picked up by vite.config.js for the dev proxy
BACKEND_URL=http://localhost:8000 npm run dev
```

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/health` | Health check |
| `GET` | `/api/v1/keyspaces` | List keyspaces |
| `GET` | `/api/v1/keyspaces/{keyspace}/tables` | List tables in a keyspace |
| `POST` | `/api/v1/query` | Execute a CQL query |
