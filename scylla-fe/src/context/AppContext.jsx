import { createContext, useContext, useState } from 'react'
import { runQuery } from '../services/api.js'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  // Selection
  const [selectedKeyspace, setSelectedKeyspace] = useState(null)
  const [selectedTable, setSelectedTable] = useState(null)

  // Query editor
  const [query, setQueryRaw] = useState('')

  // Page cache: Array<{ data: QueryResult, nextToken: string|null }>
  // Index 0 = page 1. Appended on forward fetch, never mutated on backward nav.
  const [pageCache, setPageCache] = useState([])
  const [currentPage, setCurrentPage] = useState(1)   // 1-indexed

  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState(null)

  // ── Derived ──────────────────────────────────────────────────────────────────

  const cachedEntry   = pageCache[currentPage - 1] ?? null
  const result        = cachedEntry?.data ?? null
  const pagingState   = cachedEntry?.nextToken ?? null   // token for the NEXT page

  // True total is only known once we've reached the last page (nextToken === null)
  const lastFetched      = pageCache[pageCache.length - 1]
  const totalIsDefinite  = pageCache.length > 0 && lastFetched.nextToken === null
  const totalLabel       = pageCache.length > 0
    ? totalIsDefinite ? `${pageCache.length}` : `${pageCache.length}+`
    : null

  const canPrev = currentPage > 1
  // Can go forward if: we haven't reached the end of cache, OR the current page has a next token
  const canNext = !queryLoading && (
    currentPage < pageCache.length || !!pagingState
  )

  // ── Helpers ──────────────────────────────────────────────────────────────────

  // Any edit to the textarea must invalidate the cache — the server will reject
  // a paging_state token used with a different query (400 PAGING_STATE_QUERY_MISMATCH).
  function setQuery(q) {
    setQueryRaw(q)
    setPageCache([])
    setCurrentPage(1)
    setQueryError(null)
  }

  function selectTable(keyspace, table) {
    setSelectedKeyspace(keyspace)
    setSelectedTable(table)
    const cql = `SELECT * FROM ${keyspace}.${table};`
    setQueryRaw(cql)
    setPageCache([])
    setCurrentPage(1)
    setQueryError(null)
    _fetch(cql, null, 1)
  }

  // Re-run from scratch (page 1), clears all cached pages
  async function execute(cql) {
    const q = cql ?? query
    if (!q.trim()) return
    setPageCache([])
    setCurrentPage(1)
    await _fetch(q, null, 1)
  }

  // Go to the next page — serves from cache when already fetched
  async function nextPage() {
    if (!canNext || queryLoading) return

    if (currentPage < pageCache.length) {
      // Already cached — instant navigation
      setCurrentPage((p) => p + 1)
      return
    }

    // Need to fetch the next page
    await _fetch(query, pagingState, currentPage + 1)
  }

  // Go back — always served from cache, no API call
  function prevPage() {
    if (canPrev) setCurrentPage((p) => p - 1)
  }

  // Jump to page 1 from cache (no API call)
  function reset() {
    setCurrentPage(1)
    setQueryError(null)
  }

  // Collect every row across all pages — uses cache first, then fetches remaining pages
  async function fetchAllRows() {
    if (!query.trim() || pageCache.length === 0) return null
    const columns = pageCache[0].data.columns
    const allRows = pageCache.flatMap((entry) => entry.data.rows)
    let token = pageCache[pageCache.length - 1].nextToken
    while (token) {
      const data = await runQuery(query, { pagingState: token })
      allRows.push(...data.rows)
      token = data.paging_state ?? null
    }
    return { columns, rows: allRows }
  }

  // ── Core fetch ────────────────────────────────────────────────────────────────

  async function _fetch(q, token, targetPage) {
    setQueryLoading(true)
    setQueryError(null)
    try {
      const data = await runQuery(q, { pagingState: token })
      const entry = { data, nextToken: data.paging_state ?? null }

      setPageCache((prev) => {
        // Append — never overwrite pages already in cache
        const next = [...prev]
        next[targetPage - 1] = entry
        return next
      })
      setCurrentPage(targetPage)
    } catch (e) {
      setQueryError(e.message)
      // Keep cached pages intact on error; only blank on fresh run failure
      if (targetPage === 1) setPageCache([])
    } finally {
      setQueryLoading(false)
    }
  }

  return (
    <AppContext.Provider
      value={{
        // Selection
        selectedKeyspace, selectedTable, selectTable,
        // Editor
        query, setQuery,
        // Results
        result, queryLoading, queryError,
        // Pagination
        pagingState, currentPage, totalLabel, canPrev, canNext,
        execute, nextPage, prevPage, reset, fetchAllRows,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used inside AppProvider')
  return ctx
}
