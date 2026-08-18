/**
 * Sub-portal auth client — see PORTAL_AUTH_INTEGRATION.md.
 *
 * This app has no login of its own. When embedded in the Internal Portal it asks
 * the parent for a short-lived Firebase ID token over postMessage, holds it in
 * memory, and stamps it on every backend call as `Authorization: Bearer`.
 * Requests go to the middleware gateway, which verifies the token before
 * proxying to the backend (the gateway is what supplies the backend's internal
 * X-API-Key — this frontend never sees it).
 *
 * `VITE_APP_ENV=local` on a real localhost host switches to calling the backend
 * directly with `X-Api-Key`, so a developer can run just frontend + backend.
 * Every other value takes the gateway path — fail safe, never open.
 */
import axios from 'axios'

const env = import.meta.env

const trimSlash = (v) => (v ?? '').trim().replace(/\/+$/, '')

const APP_ENV = (env.VITE_APP_ENV ?? '').trim()
const PARENT_ORIGIN = trimSlash(env.VITE_PARENT_ORIGIN)
const MIDDLEWARE_BASE_URL = trimSlash(env.VITE_MIDDLEWARE_BASE_URL)
// This portal's route on the gateway. The var name is portal-specific by
// convention (chat-history uses CH_GATEWAY_ROUTE, mf-info VITE_MF_GATEWAY_ROUTE).
const GATEWAY_ROUTE = (env.VITE_SCYLLA_VISUALIZER_GATEWAY ?? '')
  .trim()
  .replace(/^\/+|\/+$/g, '')
const GATEWAY_WS_URL = trimSlash(env.VITE_GATEWAY_WS_URL)
const LOCAL_API_URL = trimSlash(env.VITE_LOCAL_API_URL)
const LOCAL_WS_URL = trimSlash(env.VITE_LOCAL_WS_URL)
const LOCAL_API_KEY = (env.VITE_LOCAL_API_KEY ?? '').trim()

// Local mode needs BOTH the explicit opt-in and a real localhost host, so a
// stray local build served from a real host quietly takes the secure path
// instead of bypassing auth.
const isLocalhost =
  typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1', '::1', '[::1]'].includes(window.location.hostname)

export const IS_LOCAL = APP_ENV === 'local' && isLocalhost

const CH_BASE_URL = IS_LOCAL ? LOCAL_API_URL : `${MIDDLEWARE_BASE_URL}/${GATEWAY_ROUTE}`

/**
 * Whether the app has everything it needs to reach a backend at all.
 * Deliberately reports only a boolean: the UI must never reveal which mode it
 * is in or which variable is missing.
 */
export const CONFIG_OK = IS_LOCAL
  ? Boolean(LOCAL_API_URL)
  : Boolean(MIDDLEWARE_BASE_URL && GATEWAY_ROUTE && PARENT_ORIGIN)

// ─── Token state (§8) — in memory only, for the tab's lifetime ────────────────

let authToken = null
let tokenWaiters = []

const isFramed = typeof window !== 'undefined' && window.parent !== window
const canTalkToParent = isFramed && !IS_LOCAL && PARENT_ORIGIN !== ''

// If the parent never answers, a request must not hang forever. Give up waiting
// and send unauthenticated so the gateway returns a real 401. Without this the
// wrong-parent case would hang forever: a postMessage to a mismatched
// targetOrigin is silently dropped, so a token can never arrive.
const TOKEN_TIMEOUT_MS = 8000

if (typeof window !== 'undefined') {
  // The only writer of authToken. Stays active for the tab's lifetime so the
  // parent can push a refreshed token at any time — we just overwrite.
  window.addEventListener('message', (event) => {
    if (!PARENT_ORIGIN || event.origin !== PARENT_ORIGIN) return
    if (event.data?.type !== 'AUTH_TOKEN') return
    authToken = event.data.token ?? null
    const waiters = tokenWaiters
    tokenWaiters = []
    waiters.forEach((resolve) => resolve(authToken))
  })
}

/** Ask the parent for a token and wait for the AUTH_TOKEN reply. */
export function requestToken() {
  if (!canTalkToParent) return Promise.resolve(null)

  return new Promise((resolve) => {
    let settled = false
    const settle = (token) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      tokenWaiters = tokenWaiters.filter((w) => w !== settle)
      resolve(token) // the token, or null on timeout
    }
    const timer = setTimeout(() => settle(null), TOKEN_TIMEOUT_MS)

    // Coalesce: if a REQUEST_TOKEN is already in flight, just wait on it.
    // Otherwise the warm-up and the first call each ask the parent separately
    // and it hands out two tokens for one page load.
    const alreadyInFlight = tokenWaiters.length > 0
    tokenWaiters.push(settle)
    if (!alreadyInFlight) {
      window.parent.postMessage({ type: 'REQUEST_TOKEN' }, PARENT_ORIGIN)
    }
  })
}

/** Current token, asking the parent only if we don't already hold one. */
export const getToken = () =>
  authToken ? Promise.resolve(authToken) : requestToken()

// Warm-up so the first real request doesn't pay for the handshake.
if (canTalkToParent) requestToken()

// ─── Requests (§7a) ──────────────────────────────────────────────────────────

// Empty ({}) when no token could be obtained — the request then goes out
// unauthenticated and the gateway returns 401 rather than the app hanging.
async function authHeader(token) {
  if (IS_LOCAL) return LOCAL_API_KEY ? { 'X-Api-Key': LOCAL_API_KEY } : {}
  const value = token ?? (await getToken()) // getToken() may resolve null on timeout
  return value ? { Authorization: `Bearer ${value}` } : {}
}

/**
 * Every backend call goes through here, so auth and the 401-retry live in one
 * place and call sites stay auth-unaware.
 *
 * @param {string} path e.g. "/api/v1/keyspaces"
 * @param {object} [opts] axios options (method, params, data, headers)
 * @returns {Promise<any>} the response body
 */
export async function apiRequest(path, opts = {}) {
  const send = (auth) =>
    axios({
      url: `${CH_BASE_URL}${path}`,
      ...opts,
      headers: { 'Content-Type': 'application/json', ...opts.headers, ...auth },
    })

  const auth = await authHeader()
  try {
    return (await send(auth)).data
  } catch (err) {
    // Only a token we actually SENT can be "expired" and worth refreshing. With
    // no Bearer (standalone / wrong parent) the 401 is terminal — don't loop.
    if (
      IS_LOCAL ||
      err.response?.status !== 401 ||
      !canTalkToParent ||
      !auth.Authorization
    ) {
      throw err
    }
    const token = await requestToken() // fresh token, or null on timeout
    if (!token) throw err
    return (await send(await authHeader(token))).data
  }
}

// ─── WebSockets (§7b) ────────────────────────────────────────────────────────

/**
 * Open an authenticated socket. A browser WebSocket cannot set headers, so the
 * token rides in the query string — the gateway validates it at connect time.
 *
 * Nothing in this app opens a socket today; this exists so that when one is
 * added it uses the same token source rather than inventing its own.
 *
 * @param {string} path e.g. "/api/v1/stream"
 * @param {Record<string, string>} [params] extra query params
 */
export async function openSocket(path, params = {}) {
  const token = IS_LOCAL ? LOCAL_API_KEY : await getToken().catch(() => '')
  const base = IS_LOCAL
    ? `${LOCAL_WS_URL}${path}`
    : `${GATEWAY_WS_URL}/ws/${GATEWAY_ROUTE}${path}`

  const qs = new URLSearchParams({ ...params, token: token ?? '' })
  return new WebSocket(`${base}?${qs.toString()}`)
}
