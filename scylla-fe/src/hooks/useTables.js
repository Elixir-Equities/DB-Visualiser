import { useEffect, useState } from 'react'
import { fetchTables } from '../services/catalog.js'

/**
 * Lazily fetches tables for a keyspace.
 * Fires the first time `enabled` is true, and again whenever `version` changes
 * (the sidebar's refresh button); toggling `enabled` alone never re-fetches.
 */
export function useTables(keyspace, { enabled, version = 0 } = {}) {
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fetchedVersion, setFetchedVersion] = useState(null)

  const fetched = fetchedVersion === version

  useEffect(() => {
    if (!enabled || fetched || !keyspace) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchTables(keyspace)
      .then((tables) => {
        if (cancelled) return
        setTables(tables)
        setFetchedVersion(version)
      })
      .catch((e) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [enabled, fetched, keyspace, version])

  return { tables, loading, error, fetched }
}
