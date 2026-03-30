# ScyllaDB Visualiser — Frontend API Reference

**Base URL:** `http://localhost:8000/api/v1`
**Content-Type:** `application/json`

---

## Response Envelope

Every endpoint returns the same wrapper. Always check `success` before reading `data`.

```json
// Success
{
  "success": true,
  "data": { ... },
  "error": null
}

// Failure
{
  "success": false,
  "data": null,
  "error": {
    "message": "Human-readable reason",
    "code": "ERROR_CODE"
  }
}
```

---

## Endpoints

### 1. Health

#### `GET /health`

Check whether the backend and database are reachable. Always returns HTTP 200 — inspect `success` to detect a degraded state.

**No parameters.**

**Success**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "scylladb": "connected"
  },
  "error": null
}
```

**Degraded** *(HTTP 200, but `success` is false)*
```json
{
  "success": false,
  "data": null,
  "error": {
    "message": "ScyllaDB session has not been initialised.",
    "code": "SCYLLADB_UNAVAILABLE"
  }
}
```

---

### 2. Keyspaces

#### `GET /keyspaces`

Returns all keyspaces in the connected ScyllaDB cluster.

**No parameters.**

**Success**
```json
{
  "success": true,
  "data": {
    "keyspaces": [
      {
        "name": "my_keyspace",
        "replication": {
          "class": "org.apache.cassandra.locator.SimpleStrategy",
          "replication_factor": "3"
        }
      }
    ]
  },
  "error": null
}
```

---

### 3. Tables

#### `GET /tables?keyspace={keyspace}`

Returns all table names inside a keyspace.

| Param | Type | Required |
|---|---|---|
| `keyspace` | string | yes |

**Success**
```json
{
  "success": true,
  "data": {
    "keyspace": "my_keyspace",
    "tables": ["users", "sessions", "events"]
  },
  "error": null
}
```

| HTTP | Code | When |
|---|---|---|
| 404 | `HTTP_404` | Keyspace does not exist |

---

#### `GET /schema?keyspace={keyspace}&table={table}`

Returns column definitions for a specific table.

| Param | Type | Required |
|---|---|---|
| `keyspace` | string | yes |
| `table` | string | yes |

**Success**
```json
{
  "success": true,
  "data": {
    "keyspace": "my_keyspace",
    "table": "users",
    "columns": [
      { "name": "id",         "type": "uuid",      "kind": "partition_key" },
      { "name": "created_at", "type": "timestamp",  "kind": "clustering"    },
      { "name": "email",      "type": "text",       "kind": "regular"       },
      { "name": "role",       "type": "text",       "kind": "static"        }
    ]
  },
  "error": null
}
```

`kind` values: `partition_key` · `clustering` · `regular` · `static`

| HTTP | Code | When |
|---|---|---|
| 404 | `HTTP_404` | Keyspace or table does not exist |

---

### 4. Query

#### `POST /query`

Execute a CQL `SELECT` query and receive results as columns + rows.

**Request body**
```json
{
  "query": "SELECT id, email FROM my_keyspace.users WHERE active = true"
}
```

> If your query has no `LIMIT` clause, the server automatically appends `LIMIT 100`.

**Success**
```json
{
  "success": true,
  "data": {
    "columns": ["id", "email"],
    "rows": [
      { "id": "a1b2c3d4-...", "email": "alice@example.com" },
      { "id": "e5f6a7b8-...", "email": "bob@example.com"   }
    ],
    "row_count": 2
  },
  "error": null
}
```

| HTTP | Code | When |
|---|---|---|
| 400 | `HTTP_400` | Query contains `DROP`, `DELETE`, `TRUNCATE`, or `ALTER` |
| 422 | `VALIDATION_ERROR` | Body is missing or `query` field is empty |
| 504 | `HTTP_504` | Query exceeded the 10-second timeout |
| 500 | `HTTP_500` | Unexpected server-side error |

**Blocked query example**
```json
// Request
{ "query": "DROP TABLE users" }

// Response — HTTP 400
{
  "success": false,
  "data": null,
  "error": {
    "message": "Query contains a disallowed statement: DROP",
    "code": "HTTP_400"
  }
}
```

---

## Suggested Frontend Helper

```js
class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code   = code;
    this.status = status;
  }
}

async function apiFetch(path, options = {}) {
  const res  = await fetch(`http://localhost:8000/api/v1${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await res.json();

  if (!body.success) {
    throw new ApiError(body.error.message, body.error.code, res.status);
  }

  return body.data;
}

// Usage examples
const { keyspaces } = await apiFetch("/keyspaces");
const { tables }    = await apiFetch("/tables?keyspace=my_keyspace");
const schema        = await apiFetch("/schema?keyspace=my_keyspace&table=users");
const result        = await apiFetch("/query", {
  method: "POST",
  body: JSON.stringify({ query: "SELECT * FROM my_keyspace.users" }),
});
```
