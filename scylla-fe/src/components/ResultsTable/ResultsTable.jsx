import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppContext } from '../../context/AppContext.jsx'
import { useColumnResize } from '../../hooks/useColumnResize.js'
import { useCopy } from '../../hooks/useCopy.js'
import { useDismiss } from '../../hooks/useDismiss.js'
import { useSchema } from '../../hooks/useSchema.js'
import { describeValue, estimateColumnWidth } from '../../services/valueFormat.js'
import { errorHint } from '../../services/errorHints.js'
import { KEY_META } from '../SchemaViewer/keyMeta.js'
import Spinner from '../ui/Spinner.jsx'
import {
  AlertIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, ColumnsIcon,
  CopyIcon, DownloadIcon, FirstPageIcon, SortIcon,
} from '../ui/icons.jsx'
import { InlineValue } from './ValueView.jsx'
import RowInspector from './RowInspector.jsx'

const ROW_NUM_WIDTH = 52
const NO_COLUMNS = []

/** `keyspace.table` named in a query's FROM clause, if any. */
function parseFromTable(cql) {
  const m = /\bFROM\s+"?(\w+)"?\s*\.\s*"?(\w+)"?/i.exec(cql ?? '')
  return m ? { keyspace: m[1], table: m[2] } : null
}

function compareValues(a, b) {
  const na = a === null || a === undefined
  const nb = b === null || b === undefined
  if (na || nb) return na === nb ? 0 : na ? 1 : -1 // nulls last
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return describeValue(a).text.localeCompare(describeValue(b).text, undefined, { numeric: true })
}

// ─── Toolbar pieces ───────────────────────────────────────────────────────────

const toolButton =
  'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-gray-300 hover:text-white hover:bg-gray-800 transition-colors disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent'

function ColumnsMenu({ columns, hidden, setHidden }) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const ref = useRef(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)

  const shown = columns.filter((c) => c.toLowerCase().includes(filter.trim().toLowerCase()))

  function toggle(col) {
    setHidden((prev) => {
      const next = new Set(prev)
      next.has(col) ? next.delete(col) : next.add(col)
      // Never hide everything — the grid would collapse to row numbers.
      return next.size === columns.length ? prev : next
    })
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className={toolButton}>
        <ColumnsIcon className="w-3.5 h-3.5" />
        Columns
        {hidden.size > 0 && (
          <span className="rounded bg-indigo-500/20 px-1 text-[10px] text-indigo-200 tabular-nums">
            {columns.length - hidden.size}/{columns.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-64 rounded-lg border border-gray-700 bg-gray-900 shadow-2xl shadow-black/50">
          {columns.length > 8 && (
            <div className="p-2 border-b border-gray-800">
              <input
                autoFocus
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Find column…"
                aria-label="Find column"
                className="w-full rounded-md bg-gray-950 border border-gray-800 px-2 py-1 text-xs text-gray-100 placeholder-gray-500 outline-none focus:border-gray-600"
              />
            </div>
          )}
          <ul className="max-h-72 overflow-y-auto py-1">
            {shown.map((col) => (
              <li key={col}>
                <label className="flex items-center gap-2 px-3 py-1 text-xs text-gray-200 hover:bg-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!hidden.has(col)}
                    onChange={() => toggle(col)}
                    className="accent-indigo-500"
                  />
                  <span className="font-mono truncate">{col}</span>
                </label>
              </li>
            ))}
          </ul>
          {hidden.size > 0 && (
            <div className="border-t border-gray-800 px-3 py-1.5">
              <button onClick={() => setHidden(new Set())} className="text-xs text-indigo-300 hover:text-indigo-200">
                Show all columns
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ExportButton() {
  const { exportAll } = useAppContext()
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState(null)

  async function handleExport() {
    setExporting(true)
    setError(null)
    try {
      await exportAll()
    } catch (e) {
      setError(e.message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      {error && (
        <span className="text-xs text-red-300 truncate max-w-[16rem]" title={error}>
          Export failed: {error}
        </span>
      )}
      <button
        onClick={handleExport}
        disabled={exporting}
        className={toolButton}
        title="Download every row of this query as CSV — not just this page"
      >
        {exporting ? <Spinner className="w-3.5 h-3.5" /> : <DownloadIcon className="w-3.5 h-3.5" />}
        {exporting ? 'Exporting…' : 'Export CSV'}
      </button>
    </div>
  )
}

function Pager() {
  const { currentPage, canPrev, canNext, hasMore, prevPage, nextPage, firstPage, queryLoading, loadingPage } = useAppContext()
  const fetchingNext = queryLoading && loadingPage > 1
  return (
    <div className="flex items-center rounded-md border border-gray-800" role="group" aria-label="Pagination">
      <button onClick={firstPage} disabled={!canPrev} className={`${toolButton} rounded-r-none px-1.5`} aria-label="First page" title="First page">
        <FirstPageIcon className="w-3.5 h-3.5" />
      </button>
      <button onClick={prevPage} disabled={!canPrev} className={`${toolButton} rounded-none px-1.5`} aria-label="Previous page" title="Previous page">
        <ChevronLeftIcon className="w-3.5 h-3.5" />
      </button>
      <span className="px-2 text-xs text-gray-300 tabular-nums border-x border-gray-800 py-1" aria-live="polite">
        Page {currentPage}{!hasMore && currentPage > 1 ? ' (last)' : ''}
      </span>
      <button onClick={nextPage} disabled={!canNext} className={`${toolButton} rounded-l-none px-1.5`} aria-label="Next page" title={hasMore ? 'Next page' : 'No more rows'}>
        {fetchingNext ? <Spinner className="w-3.5 h-3.5" /> : <ChevronRightIcon className="w-3.5 h-3.5" />}
      </button>
    </div>
  )
}

// ─── Grid cells ───────────────────────────────────────────────────────────────

function Cell({ value, cellKey, copied, onCopy }) {
  const isCopied = copied === cellKey
  const { text } = describeValue(value)
  return (
    <td className="group/cell relative px-3 py-1.5 font-mono whitespace-nowrap overflow-hidden text-ellipsis border-r border-gray-800/40">
      <InlineValue value={value} />
      {text !== null && (
        <button
          className={`absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded bg-gray-900 shadow transition-opacity
            ${isCopied ? 'text-emerald-400 opacity-100' : 'text-gray-400 hover:text-white opacity-0 group-hover/cell:opacity-100 focus-visible:opacity-100'}`}
          onClick={(e) => { e.stopPropagation(); onCopy(cellKey, text) }}
          aria-label="Copy value"
          title="Copy value"
        >
          {isCopied ? <CheckIcon className="w-3 h-3" /> : <CopyIcon className="w-3 h-3" />}
        </button>
      )}
    </td>
  )
}

function HeaderCell({ col, width, info, sort, onSort, onResizeStart }) {
  const thRef = useRef(null)
  const keyMeta = info && info.kind !== 'regular' ? KEY_META[info.kind] : null
  const sorted = sort.col === col ? sort.dir : null

  return (
    <th
      ref={thRef}
      scope="col"
      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
      className="relative p-0 bg-gray-800 border-b border-r border-gray-700/70 text-left font-medium select-none"
      style={{ width, minWidth: width, maxWidth: width }}
    >
      <button
        onClick={() => onSort(col)}
        className="w-full flex flex-col items-start gap-0.5 px-3 py-1.5 pr-5 text-left hover:bg-gray-700/40 transition-colors"
        title={`Sort this page by ${col}`}
      >
        <span className="flex items-center gap-1.5 w-full min-w-0">
          {keyMeta && <span className={`rounded px-1 text-[9px] leading-4 font-semibold ${keyMeta.badge}`}>{keyMeta.short}</span>}
          <span className={`truncate font-mono text-xs ${keyMeta ? keyMeta.text : 'text-gray-100'}`}>{col}</span>
          {sorted && <SortIcon dir={sorted} className="w-3 h-3 text-indigo-300" />}
        </span>
        {info?.type && <span className="font-mono text-[10px] text-gray-400 truncate w-full">{info.type}</span>}
      </button>
      <div
        className="absolute right-0 top-0 h-full w-2 cursor-col-resize group/handle z-10 flex justify-end"
        onMouseDown={(e) => onResizeStart(e, col, thRef.current)}
        aria-hidden="true"
      >
        <div className="w-0.5 h-full group-hover/handle:bg-indigo-500 transition-colors" />
      </div>
    </th>
  )
}

// ─── States ───────────────────────────────────────────────────────────────────

function Panel({ children }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-800 px-6 text-center">
      {children}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="flex-1 min-h-0 rounded-lg border border-gray-800 overflow-hidden" aria-busy="true" aria-label="Loading results">
      <div className="flex gap-4 px-3 py-3 border-b border-gray-800 bg-gray-800/60">
        {[40, 80, 55, 65, 70].map((w, i) => (
          <div key={i} className="h-3 rounded bg-gray-700 animate-pulse" style={{ width: `${w}px`, animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
      {[1, 2, 3, 4, 5, 6].map((row) => (
        <div key={row} className="flex gap-4 px-3 py-2.5 border-b border-gray-800/60">
          {[55, 110, 70, 85, 60].map((w, i) => (
            <div key={i} className="h-3 rounded bg-gray-800 animate-pulse" style={{ width: `${w}px`, animationDelay: `${row * 80 + i * 40}ms` }} />
          ))}
        </div>
      ))}
    </div>
  )
}

function ErrorBanner({ error, onDismiss, title = 'Query failed' }) {
  const hint = errorHint(error)
  return (
    <div role="alert" className="flex-shrink-0 rounded-lg border border-red-900/70 bg-red-950/30 px-4 py-3 flex gap-3">
      <AlertIcon className="w-4 h-4 text-red-400 mt-0.5" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium text-red-200">{title}</p>
        {hint && <p className="text-xs text-red-100/90 leading-relaxed">{hint}</p>}
        <p className="text-xs text-red-300/90 font-mono whitespace-pre-wrap break-words">{error}</p>
      </div>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss error" className="self-start p-1 rounded text-red-300 hover:text-white hover:bg-red-900/40">
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

// ─── Grid ─────────────────────────────────────────────────────────────────────

function ResultGrid({ result }) {
  const { rowOffset, queryLoading, resultQuery, isStale, elapsedMs, hasMore, currentPage, execute } = useAppContext()
  const { copied, copy } = useCopy()
  const columns = result.columns ?? NO_COLUMNS
  const rows = result.rows
  const columnsKey = columns.join(' ')

  // Types and key roles when the query reads one table straight from a FROM clause.
  const from = parseFromTable(resultQuery)
  const { schema } = useSchema(from?.keyspace, from?.table)
  const columnInfo = useMemo(() => {
    const info = {}
    for (const c of schema?.columns ?? []) info[c.name] = c
    return info
  }, [schema])

  // Size columns to their content once per column set, so paging doesn't make them jump.
  const estimates = useRef({ key: null, widths: {} })
  if (estimates.current.key !== columnsKey) {
    estimates.current = {
      key: columnsKey,
      widths: Object.fromEntries(columns.map((c) => [c, estimateColumnWidth(c, rows)])),
    }
  }
  const { getWidth, startResize } = useColumnResize(columns, estimates.current.widths)

  const [hidden, setHidden] = useState(() => new Set())
  const [sort, setSort] = useState({ col: null, dir: null })
  const [selected, setSelected] = useState(null) // index into `rows`

  useEffect(() => {
    setHidden(new Set())
    setSort({ col: null, dir: null })
  }, [columnsKey])

  // A new page means different rows — the open row no longer exists.
  useEffect(() => { setSelected(null) }, [result])

  const visibleColumns = columns.filter((c) => !hidden.has(c))

  const order = useMemo(() => {
    const idx = rows.map((_, i) => i)
    if (!sort.col) return idx
    const sign = sort.dir === 'desc' ? -1 : 1
    return idx.sort((a, b) => sign * compareValues(rows[a][sort.col], rows[b][sort.col]) || a - b)
  }, [rows, sort])

  function cycleSort(col) {
    setSort((s) => {
      if (s.col !== col) return { col, dir: 'asc' }
      if (s.dir === 'asc') return { col, dir: 'desc' }
      return { col: null, dir: null }
    })
  }

  const selectedPos = selected === null ? -1 : order.indexOf(selected)
  const goPrev = selectedPos > 0 ? () => setSelected(order[selectedPos - 1]) : null
  const goNext = selectedPos >= 0 && selectedPos < order.length - 1 ? () => setSelected(order[selectedPos + 1]) : null
  const closeInspector = useCallback(() => setSelected(null), [])

  // Keep the inspected row in view while stepping with the keyboard.
  const bodyRef = useRef(null)
  useEffect(() => {
    if (selected === null) return
    bodyRef.current?.querySelector(`[data-row="${selected}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const first = rowOffset + 1
  const last = rowOffset + rows.length
  const tableWidth = ROW_NUM_WIDTH + visibleColumns.reduce((sum, c) => sum + getWidth(c), 0)

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 flex-shrink-0">
        <p className="flex items-center gap-1.5 text-xs text-gray-400 tabular-nums">
          <span className="text-gray-100 font-medium">
            {rows.length === 0 ? 'No rows' : `Rows ${first.toLocaleString()}–${last.toLocaleString()}`}
          </span>
          {rows.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className={hasMore ? 'text-gray-300' : ''}>{hasMore ? 'more available' : 'end of results'}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span>{columns.length} {columns.length === 1 ? 'column' : 'columns'}</span>
          {elapsedMs !== null && (
            <>
              <span aria-hidden="true">·</span>
              <span>{elapsedMs < 1000 ? `${elapsedMs} ms` : `${(elapsedMs / 1000).toFixed(1)} s`}</span>
            </>
          )}
          {sort.col && (
            <>
              <span aria-hidden="true">·</span>
              <button onClick={() => setSort({ col: null, dir: null })} className="text-indigo-300 hover:text-indigo-200">
                sorted on this page by {sort.col} — clear
              </button>
            </>
          )}
        </p>

        {isStale && (
          <span className="flex items-center gap-2 rounded-full border border-amber-700/60 bg-amber-950/40 pl-2.5 pr-1 py-0.5 text-xs text-amber-200">
            Query edited — results are from the previous run
            <button
              onClick={() => execute()}
              disabled={queryLoading}
              className="rounded-full bg-amber-500/20 px-2 py-px text-amber-100 hover:bg-amber-500/30 disabled:opacity-50"
            >
              Run
            </button>
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {columns.length > 0 && <ColumnsMenu columns={columns} hidden={hidden} setHidden={setHidden} />}
          <Pager />
          <ExportButton />
        </div>
      </div>

      {rows.length === 0 ? (
        <Panel>
          <p className="text-sm text-gray-300">The query returned no rows</p>
          <p className="mt-1 text-xs text-gray-500">Check the WHERE clause — or the table may simply be empty.</p>
        </Panel>
      ) : (
        <div className="relative flex-1 min-h-0 rounded-lg border border-gray-800 overflow-hidden">
          {queryLoading && (
            <div className="absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-indigo-950" aria-hidden="true">
              <div className="h-full w-2/5 bg-indigo-400 animate-indeterminate" />
            </div>
          )}

          <div ref={bodyRef} className={`h-full overflow-auto transition-opacity ${queryLoading ? 'opacity-50 pointer-events-none' : ''}`}>
            <table className="text-xs text-left border-separate border-spacing-0" style={{ tableLayout: 'fixed', width: tableWidth, minWidth: '100%' }}>
              <colgroup>
                <col style={{ width: ROW_NUM_WIDTH }} />
                {visibleColumns.map((c) => <col key={c} style={{ width: getWidth(c) }} />)}
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr>
                  <th scope="col" className="sticky left-0 z-20 bg-gray-800 border-b border-r border-gray-700/70 px-2 text-right text-[10px] font-medium text-gray-500">
                    #
                  </th>
                  {visibleColumns.map((col) => (
                    <HeaderCell
                      key={col}
                      col={col}
                      width={getWidth(col)}
                      info={columnInfo[col]}
                      sort={sort}
                      onSort={cycleSort}
                      onResizeStart={startResize}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {order.map((i) => {
                  const row = rows[i]
                  const isSelected = selected === i
                  return (
                    <tr
                      key={i}
                      data-row={i}
                      onClick={() => setSelected(isSelected ? null : i)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-indigo-500/15' : 'odd:bg-gray-900 even:bg-gray-900/40 hover:bg-gray-800/70'
                      }`}
                    >
                      <td className={`sticky left-0 z-[5] px-2 py-1.5 text-right text-[11px] tabular-nums border-r border-gray-800 ${
                        isSelected ? 'bg-indigo-900/60 text-indigo-100' : 'bg-gray-900 text-gray-500'
                      }`}>
                        {(rowOffset + i + 1).toLocaleString()}
                      </td>
                      {visibleColumns.map((col) => (
                        <Cell key={col} value={row[col]} cellKey={`${i}-${col}`} copied={copied} onCopy={copy} />
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {selected !== null && rows[selected] && (
            <RowInspector
              row={rows[selected]}
              rowNumber={rowOffset + selected + 1}
              columns={columns}
              columnInfo={columnInfo}
              onClose={closeInspector}
              onPrev={goPrev}
              onNext={goNext}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)

export default function ResultsTable() {
  const { result, queryError, queryLoading, query, dismissError } = useAppContext()

  if (!result) {
    if (queryLoading) return <LoadingSkeleton />
    if (queryError) {
      return (
        <div className="flex-1 min-h-0 flex flex-col gap-3">
          <ErrorBanner error={queryError} onDismiss={dismissError} />
        </div>
      )
    }
    return (
      <Panel>
        {query.trim() ? (
          <>
            <p className="text-sm text-gray-300">Ready to run</p>
            <p className="mt-1 text-xs text-gray-500">
              Press <kbd className="rounded border border-gray-700 bg-gray-800 px-1 font-sans text-gray-300">{isMac ? '⌘' : 'Ctrl'}</kbd>{' '}
              <kbd className="rounded border border-gray-700 bg-gray-800 px-1 font-sans text-gray-300">↵</kbd> or the Run button to see results.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-300">No results yet</p>
            <p className="mt-1 text-xs text-gray-500">Pick a table in the sidebar to preview it, or write a CQL query above.</p>
          </>
        )}
      </Panel>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      {queryError && <ErrorBanner error={queryError} onDismiss={dismissError} title="Couldn't load the next page" />}
      <ResultGrid result={result} />
    </div>
  )
}
