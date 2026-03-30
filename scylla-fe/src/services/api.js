import axios from 'axios'

// Always relative — the server (Vite dev proxy or nginx) forwards to the backend.
// The browser never needs to know the backend's address.
const BASE_URL = '/api/v1'

const client = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Unwrap the response envelope and throw a structured error on failure.
client.interceptors.response.use(
  (response) => {
    const body = response.data
    if (!body.success) {
      const err = new Error(body.error?.message ?? 'Unknown API error')
      err.code = body.error?.code ?? 'UNKNOWN'
      err.status = response.status
      return Promise.reject(err)
    }
    return body.data
  },
  (error) => {
    // Network / timeout errors — axios never got a response
    if (!error.response) {
      const err = new Error(error.message ?? 'Network error')
      err.code = 'NETWORK_ERROR'
      err.status = 0
      return Promise.reject(err)
    }
    // HTTP errors where the server still returned our envelope
    const body = error.response.data
    const msg = body?.error?.message ?? error.message
    const code = body?.error?.code ?? 'HTTP_ERROR'
    const e = new Error(msg)
    e.code = code
    e.status = error.response.status
    return Promise.reject(e)
  },
)

/**
 * GET /health
 * @returns {{ status: string, scylladb: string }}
 */
export async function getHealth() {
  return client.get('/health')
}

/**
 * GET /keyspaces
 * @returns {{ keyspaces: Array<{ name: string, replication: object }> }}
 */
export async function getKeyspaces() {
  return client.get('/keyspaces')
}

/**
 * GET /tables?keyspace=...
 * @param {string} keyspace
 * @returns {{ keyspace: string, tables: string[] }}
 */
export async function getTables(keyspace) {
  return client.get('/tables', { params: { keyspace } })
}

/**
 * GET /schema?keyspace=...&table=...
 * @param {string} keyspace
 * @param {string} table
 * @returns {{ table_name: string, keyspace: string, columns: Array<{ name: string, type: string, kind: 'partition_key'|'clustering'|'regular' }> }}
 */
export async function getSchema(keyspace, table) {
  return client.get('/schema', { params: { keyspace, table } })
}

/**
 * POST /query
 * @param {string} query CQL SELECT statement
 * @param {{ pageSize?: number, pagingState?: string|null }} [opts]
 * @returns {{ columns: string[], rows: object[], row_count: number, paging_state: string|null }}
 */
export async function runQuery(query, { pageSize = 50, pagingState = null } = {}) {
  return client.post('/query', {
    query,
    page_size: pageSize,
    paging_state: pagingState,
  })
}
