/**
 * Session cache of cluster metadata (keyspaces → tables → columns).
 *
 * The sidebar, the Schema tab, the results grid and editor autocomplete all
 * read the same metadata; sharing one in-flight promise per item keeps that to
 * a single request each. Failed requests are evicted so a later read retries.
 */
import { getKeyspaces, getSchema, getTables } from './api.js'

let keyspacesPromise = null
const tablesCache = new Map()
const schemaCache = new Map()

function cached(map, key, load) {
  if (!map.has(key)) {
    const pending = load().catch((e) => {
      map.delete(key)
      throw e
    })
    map.set(key, pending)
  }
  return map.get(key)
}

/** @returns {Promise<string[]>} keyspace names */
export function fetchKeyspaces({ force = false } = {}) {
  if (force || !keyspacesPromise) {
    keyspacesPromise = getKeyspaces()
      .then(({ keyspaces }) => keyspaces)
      .catch((e) => {
        keyspacesPromise = null
        throw e
      })
  }
  return keyspacesPromise
}

/** @returns {Promise<string[]>} table names in `keyspace` */
export function fetchTables(keyspace) {
  return cached(tablesCache, keyspace, () => getTables(keyspace).then(({ tables }) => tables))
}

/** @returns {Promise<{ table_name: string, columns: Array<{ name: string, type: string, kind: string }> }>} */
export function fetchSchema(keyspace, table) {
  return cached(schemaCache, `${keyspace}.${table}`, () => getSchema(keyspace, table))
}

/** Forget everything — the sidebar's refresh button. */
export function invalidateCatalog() {
  keyspacesPromise = null
  tablesCache.clear()
  schemaCache.clear()
}
