import { useEffect, useState } from 'react'
import { getTables } from '../services/api.js'

/**
 * Lazily fetches tables for a keyspace.
 * Only fires when `enabled` becomes true; subsequent enable toggles do NOT re-fetch.
 */
export function useTables(keyspace, { enabled } = {}) {
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fetched, setFetched] = useState(false)

  useEffect(() => {
    if (!enabled || fetched || !keyspace) return
    setLoading(true)
    setError(null)
    getTables(keyspace)
      .then(({ tables }) => {
        setTables(tables)
        setFetched(true)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [enabled, fetched, keyspace])

  return { tables, loading, error, fetched }
}
