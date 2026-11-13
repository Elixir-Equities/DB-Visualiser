/**
 * Per-browser UI preferences (last query, history, sidebar width…).
 *
 * Storage can be missing or throw (private windows, blocked third-party
 * storage when embedded in the portal iframe), so every access is guarded and
 * the UI must work identically without it.
 */
const PREFIX = 'scyllascope:'

export function loadPref(key, fallback) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    return raw === null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function savePref(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* Storage unavailable — preferences just won't persist. */
  }
}
