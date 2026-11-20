import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { exportQueryCSV, runQuery } from '../services/api.js'
import { loadPref, savePref } from '../services/storage.js'

const AppContext = createContext(null)

const HISTORY_LIMIT = 25

export function tableQuery(keyspace, table) {
  return `SELECT * FROM ${keyspace}.${table};`
}

export function AppProvider({ children }) {
  // Selection — restored from the last session, but nothing runs until asked.
  const [selectedKeyspace, setSelectedKeyspace] = useState(() => loadPref('selection', null)?.keyspace ?? null)
  const [selectedTable, setSelectedTable] = useState(() => loadPref('selection', null)?.table ?? null)
  const [activeTab, setActiveTab] = useState('data')

  // Editor text, and the query that produced the cached pages. They differ once
  // the user edits after a run: results stay visible (marked stale) and paging
  // keeps using `resultQuery`, so a paging token is never sent with a query it
  // doesn't belong to (400 PAGING_STATE_QUERY_MISMATCH).
  const [query, setQuery] = useState(() => loadPref('query', ''))
  const [resultQuery, setResultQuery] = useState(null)
  // Editor text when the current results were requested (differs from
  // `resultQuery` when only a selection was run). Drives the "stale" chip.
  const [editorAtRun, setEditorAtRun] = useState(null)

  // Page cache: Array<{ data: QueryResult, nextToken: string|null, ms: number }>
  // Index 0 = page 1. Appended on forward fetch, never mutated on backward nav.
  const [pageCache, setPageCache] = useState([])
  const [currentPage, setCurrentPage] = useState(1)   // 1-indexed

  const [queryLoading, setQueryLoading] = useState(false)
  const [loadingPage, setLoadingPage] = useState(null)
  const [queryError, setQueryError] = useState(null)

  const [history, setHistory] = useState(() => loadPref('history', []))

  // Responses from superseded requests (e.g. Run pressed again mid-fetch) are dropped.
  const requestId = useRef(0)

  useEffect(() => { savePref('query', query) }, [query])
  useEffect(() => { savePref('history', history) }, [history])
  useEffect(() => {
    savePref('selection', selectedKeyspace ? { keyspace: selectedKeyspace, table: selectedTable } : null)
  }, [selectedKeyspace, selectedTable])

  // ── Derived ──────────────────────────────────────────────────────────────────

  const cachedEntry = pageCache[currentPage - 1] ?? null
  const result      = cachedEntry?.data ?? null
  const pagingState = cachedEntry?.nextToken ?? null   // token for the NEXT page
  const elapsedMs   = cachedEntry?.ms ?? null

  // Absolute index of the first row on the current page (pages vary in size
  // when Scylla filters, so sum what came before rather than multiply).
  let rowOffset = 0
  for (let i = 0; i < currentPage - 1; i++) rowOffset += pageCache[i]?.data.rows.length ?? 0

  const hasMore = !!pagingState || currentPage < pageCache.length
  const isStale = result !== null && editorAtRun !== null && query.trim() !== editorAtRun.trim()

  const canPrev = currentPage > 1 && !queryLoading
  const canNext = !queryLoading && hasMore

  // ── Actions ──────────────────────────────────────────────────────────────────

  function rememberQuery(q) {
    setHistory((prev) => {
      const trimmed = q.trim()
      const rest = prev.filter((h) => h.query.trim() !== trimmed)
      return [{ query: trimmed, at: Date.now() }, ...rest].slice(0, HISTORY_LIMIT)
    })
  }

  function clearHistory() {
    setHistory([])
  }

  function selectTable(keyspace, table, { tab = 'data' } = {}) {
    setSelectedKeyspace(keyspace)
    setSelectedTable(table)
    setActiveTab(tab)
    if (tab === 'data') execute(tableQuery(keyspace, table))
  }

  /** Put a query in the editor and show it, without running it. */
  function openInEditor(cql) {
    setQuery(cql)
    setActiveTab('data')
  }

  /**
   * Run `cql` (or the editor text) from page 1, replacing cached pages.
   * `syncEditor: false` runs a fragment (e.g. the selected text) without
   * replacing what is in the editor.
   */
  async function execute(cql, { syncEditor = true } = {}) {
    const q = (cql ?? query).trim()
    if (!q) return
    let editorText = query
    if (cql !== undefined && syncEditor) {
      editorText = cql
      if (cql !== query) setQuery(cql)
    }
    rememberQuery(q)
    await _fetch(q, null, 1, editorText)
  }

  // Next page — served from cache when already fetched
  async function nextPage() {
    if (!canNext) return
    if (currentPage < pageCache.length) {
      setCurrentPage((p) => p + 1)
      return
    }
    await _fetch(resultQuery, pagingState, currentPage + 1)
  }

  // Back — always served from cache, no API call
  function prevPage() {
    if (canPrev) setCurrentPage((p) => p - 1)
  }

  // Jump to page 1 from cache (no API call)
  function firstPage() {
    if (!queryLoading) setCurrentPage(1)
  }

  function dismissError() {
    setQueryError(null)
  }

  // Stream every row of the query on screen as CSV — the browser writes it to disk
  function exportAll() {
    const q = (resultQuery ?? query).trim()
    if (!q) return Promise.resolve()
    return exportQueryCSV(q)
  }

  // ── Core fetch ────────────────────────────────────────────────────────────────

  async function _fetch(q, token, targetPage, editorText) {
    const id = ++requestId.current
    setQueryLoading(true)
    setLoadingPage(targetPage)
    setQueryError(null)
    const started = performance.now()
    try {
      const data = await runQuery(q, { pagingState: token })
      if (id !== requestId.current) return
      const entry = { data, nextToken: data.paging_state ?? null, ms: Math.round(performance.now() - started) }

      if (targetPage === 1) {
        setPageCache([entry])
        setResultQuery(q)
        setEditorAtRun(editorText)
      } else {
        setPageCache((prev) => {
          const next = [...prev]
          next[targetPage - 1] = entry
          return next
        })
      }
      setCurrentPage(targetPage)
    } catch (e) {
      if (id !== requestId.current) return
      setQueryError(e.message)
      // A failed fresh run clears old results so they aren't mistaken for its
      // output; a failed next-page keeps the pages already loaded.
      if (targetPage === 1) {
        setPageCache([])
        setResultQuery(null)
        setCurrentPage(1)
      }
    } finally {
      if (id === requestId.current) {
        setQueryLoading(false)
        setLoadingPage(null)
      }
    }
  }

  return (
    <AppContext.Provider
      value={{
        // Selection & navigation
        selectedKeyspace, selectedTable, selectTable,
        activeTab, setActiveTab,
        // Editor
        query, setQuery, openInEditor, history, clearHistory,
        // Results
        result, resultQuery, isStale, elapsedMs, rowOffset,
        queryLoading, loadingPage, queryError, dismissError,
        // Pagination
        currentPage, hasMore, canPrev, canNext,
        execute, nextPage, prevPage, firstPage, exportAll,
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
