/**
 * Backend calls.
 *
 * Every request goes through apiClient's `apiRequest`, which owns the base URL,
 * the auth header, and the 401 refresh-and-retry. Nothing here is auth-aware —
 * and nothing outside this module should call the backend directly.
 */
import { apiRequest } from '../api/apiClient.js'

class ApiError extends Error {
  constructor(message, code, status) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

/**
 * Unwrap the { success, data, error } envelope and normalise every failure
 * into an ApiError carrying message/code/status.
 */
async function call(path, opts = {}) {
  let body
  try {
    body = await apiRequest(path, opts)
  } catch (err) {
    // Network / timeout — the request never got a response
    if (!err.response) {
      throw new ApiError(err.message ?? 'Network error', 'NETWORK_ERROR', 0)
    }
    // HTTP error; the server may still have returned our envelope
    const data = err.response.data
    throw new ApiError(
      data?.error?.message ?? err.message,
      data?.error?.code ?? 'HTTP_ERROR',
      err.response.status,
    )
  }

  // 200 with success:false
  if (!body?.success) {
    throw new ApiError(
      body?.error?.message ?? 'Unknown API error',
      body?.error?.code ?? 'UNKNOWN',
      200,
    )
  }

  return body.data
}

/**
 * GET /health
 * @returns {{ status: string, scylladb: string }}
 */
export async function getHealth() {
  return call('/api/v1/health')
}

/**
 * GET /keyspaces
 * @returns {{ keyspaces: Array<{ name: string, replication: object }> }}
 */
export async function getKeyspaces() {
  return call('/api/v1/keyspaces')
}

/**
 * GET /tables?keyspace=...
 * @param {string} keyspace
 * @returns {{ keyspace: string, tables: string[] }}
 */
export async function getTables(keyspace) {
  return call('/api/v1/tables', { params: { keyspace } })
}

/**
 * GET /schema?keyspace=...&table=...
 * @param {string} keyspace
 * @param {string} table
 * @returns {{ table_name: string, keyspace: string, columns: Array<{ name: string, type: string, kind: 'partition_key'|'clustering'|'regular' }> }}
 */
export async function getSchema(keyspace, table) {
  return call('/api/v1/schema', { params: { keyspace, table } })
}

/**
 * POST /query
 * @param {string} query CQL SELECT statement
 * @param {{ pageSize?: number, pagingState?: string|null }} [opts]
 * @returns {{ columns: string[], rows: object[], row_count: number, paging_state: string|null }}
 */
export async function runQuery(query, { pageSize = 50, pagingState = null } = {}) {
  return call('/api/v1/query', {
    method: 'POST',
    data: {
      query,
      page_size: pageSize,
      paging_state: pagingState,
    },
  })
}
