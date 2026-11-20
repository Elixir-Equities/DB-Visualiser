import { useCallback, useEffect, useRef, useState } from 'react'

const RESET_MS = 1500

/** Clipboard copy with a short-lived "copied" marker keyed by the caller. */
export function useCopy() {
  const [copied, setCopied] = useState(null)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = useCallback((key, text) => {
    if (text === null || text === undefined) return
    navigator.clipboard?.writeText(String(text)).then(() => {
      setCopied(key)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(null), RESET_MS)
    }).catch(() => { /* Clipboard blocked (e.g. iframe permissions) — nothing to show. */ })
  }, [])

  return { copied, copy }
}
