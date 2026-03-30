import { useCallback, useEffect, useState } from 'react'
import { getKeyspaces } from '../services/api.js'

export function useKeyspaces() {
  const [keyspaces, setKeyspaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { keyspaces } = await getKeyspaces()
      setKeyspaces(keyspaces)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { keyspaces, loading, error, reload: load }
}
