import { useEffect, useState } from 'react'
import { getSchema } from '../services/api.js'

export function useSchema(keyspace, table) {
  const [schema, setSchema] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!keyspace || !table) {
      setSchema(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    getSchema(keyspace, table)
      .then((data) => { if (!cancelled) setSchema(data) })
      .catch((e) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [keyspace, table])

  return { schema, loading, error }
}
