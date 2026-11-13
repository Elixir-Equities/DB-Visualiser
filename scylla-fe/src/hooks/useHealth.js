import { useCallback, useEffect, useRef, useState } from 'react'
import { getHealth } from '../services/api.js'

const POLL_MS = 60_000

/**
 * Backend + ScyllaDB reachability, re-checked periodically and whenever the
 * tab becomes visible again.
 * @returns {{ status: 'checking'|'ok'|'down', message: string|null, recheck: () => void }}
 */
export function useHealth() {
  const [status, setStatus] = useState('checking')
  const [message, setMessage] = useState(null)
  const inFlight = useRef(false)

  const recheck = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      await getHealth()
      setStatus('ok')
      setMessage(null)
    } catch (e) {
      setStatus('down')
      setMessage(e.message)
    } finally {
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    recheck()
    const timer = setInterval(recheck, POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') recheck() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [recheck])

  return { status, message, recheck }
}
