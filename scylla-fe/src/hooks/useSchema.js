import { useEffect, useState } from 'react'
import { fetchSchema } from '../services/catalog.js'

export function useSchema(keyspace, table) {
  const [schema, setSchema] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!keyspace || !table) {
      setSchema(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setSchema(null)
    fetchSchema(keyspace, table)
      .then((data) => { if (!cancelled) setSchema(data) })
      .catch((e) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [keyspace, table])

  return { schema, loading, error }
}
