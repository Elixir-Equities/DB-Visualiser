import { useCallback, useRef, useState } from 'react'
import { useAppContext } from '../../context/AppContext.jsx'
import { useColumnResize } from '../../hooks/useColumnResize.js'

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function toCSV(columns, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [columns.map(esc).join(','), ...rows.map(r => columns.map(c => esc(r[c])).join(','))].join('\n')
}

function triggerDownload(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const MAX_CELL_LENGTH = 120
const COPY_RESET_MS = 1500

// ─── Shared states ────────────────────────────────────────────────────────────

function useCopyCell() {
  const [copied, setCopied] = useState(null) // "rowIndex-colName"
  const timer = useRef(null)

  const copy = useCallback((key, value) => {
    if (value === null || value === undefined) return
    navigator.clipboard.writeText(String(value)).then(() => {
      setCopied(key)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(null), COPY_RESET_MS)
    })
  }, [])

  return { copied, copy }
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CopyIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  )
}

function SpinIcon() {
  return (
    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}

// ─── Cell ─────────────────────────────────────────────────────────────────────

function Cell({ value, rowIndex, col, copied, onCopy }) {
  const key = `${rowIndex}-${col}`
  const isCopied = copied === key
  const isNull = value === null || value === undefined
  const full = isNull ? null : String(value)
  const display = full && full.length > MAX_CELL_LENGTH
    ? full.slice(0, MAX_CELL_LENGTH) + '…'
    : full

  return (
    <td className="group relative px-3 py-1.5 font-mono whitespace-nowrap overflow-hidden">
      {isNull
        ? <span className="text-gray-700 italic select-none">null</span>
        : <span title={full} className="block overflow-hidden text-ellipsis text-gray-300 pr-5">
            {display}
          </span>
      }

      {!isNull && (
        <button
          className={`
            absolute right-1.5 top-1/2 -translate-y-1/2
            opacity-0 group-hover:opacity-100 transition-opacity
            p-0.5 rounded
            ${isCopied
              ? 'text-green-400'
              : 'text-gray-600 hover:text-gray-300 hover:bg-gray-700/60'
            }
          `}
          onClick={() => onCopy(key, value)}
          title="Copy value"
        >
          {isCopied ? <CheckIcon /> : <CopyIcon />}
        </button>
      )}
    </td>
  )
}

// ─── Header cell with resize handle ──────────────────────────────────────────

function HeaderCell({ col, width, onResizeStart }) {
  const thRef = useRef(null)

  return (
    <th
      ref={thRef}
      className="relative px-3 py-2 text-gray-400 font-medium whitespace-nowrap border-b border-gray-700 tracking-wide text-left select-none"
      style={{ width, minWidth: width }}
    >
      <span className="block overflow-hidden text-ellipsis pr-2">{col}</span>

      {/* Resize handle */}
      <div
        className="absolute right-0 top-0 h-full w-4 flex items-center justify-center cursor-col-resize group/handle z-10"
        onMouseDown={(e) => onResizeStart(e, col, thRef.current)}
      >
        <div className="w-px h-4 bg-gray-700 group-hover/handle:bg-indigo-500 transition-colors" />
      </div>
    </th>
  )
}

// ─── Static states ────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <svg className="w-9 h-9 text-gray-700 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
      <div className="text-center space-y-1">
        <p className="text-sm text-gray-500">No results yet</p>
        <p className="text-xs text-gray-700">Select a table or write a CQL query above</p>
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="rounded-lg border border-gray-700/60 overflow-hidden">
      <div className="flex gap-4 px-3 py-2 border-b border-gray-800 bg-gray-800/60">
        {[40, 80, 55, 65].map((w, i) => (
          <div key={i} className="h-3 rounded bg-gray-700 animate-pulse" style={{ width: `${w}px`, animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
      <div className="divide-y divide-gray-800/60">
        {[1, 2, 3, 4].map((row) => (
          <div key={row} className="flex gap-4 px-3 py-2">
            {[55, 110, 70, 85].map((w, i) => (
              <div key={i} className="h-3 rounded bg-gray-800 animate-pulse" style={{ width: `${w}px`, animationDelay: `${row * 80 + i * 40}ms` }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function ErrorState({ error }) {
  return (
    <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 flex gap-3">
      <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div className="min-w-0">
        <p className="text-xs font-medium text-red-400">Query failed</p>
        <p className="text-xs text-red-500/70 mt-0.5 font-mono whitespace-pre-wrap break-all">{error}</p>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ResultsTable() {
  const { result, queryError, queryLoading, currentPage, totalLabel, fetchAllRows } = useAppContext()
  const { copied, copy } = useCopyCell()
  const [exporting, setExporting] = useState(false)

  function handleExportPage() {
    if (!result) return
    triggerDownload(`query-page-${currentPage}.csv`, toCSV(result.columns, result.rows))
  }

  async function handleExportAll() {
    setExporting(true)
    try {
      const data = await fetchAllRows()
      if (data) triggerDownload('query-all-rows.csv', toCSV(data.columns, data.rows))
    } finally {
      setExporting(false)
    }
  }

  const columns = result?.columns ?? []
  const { getWidth, startResize } = useColumnResize(columns)

  if (queryLoading) return <LoadingSkeleton />
  if (queryError) return <ErrorState error={queryError} />
  if (!result) return <EmptyState />

  const { rows, row_count } = result
  const count = row_count ?? rows.length

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-gray-700/60 px-4 py-8 text-center">
        <p className="text-sm text-gray-500">Query returned no rows</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 min-h-0">
      {/* Meta bar */}
      <div className="flex items-center gap-2 text-xs text-gray-600 px-0.5">
        <span className="tabular-nums">{count} {count === 1 ? 'row' : 'rows'}</span>
        <span>·</span>
        <span>{columns.length} {columns.length === 1 ? 'column' : 'columns'}</span>
        <span>·</span>
        <span className="tabular-nums">
          {totalLabel ? `page ${currentPage} of ${totalLabel}` : `page ${currentPage}`}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-gray-700">drag edges to resize</span>
          <button
            onClick={handleExportPage}
            className="flex items-center gap-1 text-gray-600 hover:text-gray-300 transition-colors"
            title="Export current page to CSV"
          >
            <DownloadIcon />
            <span>Export page</span>
          </button>
          <button
            onClick={handleExportAll}
            disabled={exporting}
            className="flex items-center gap-1 text-gray-600 hover:text-gray-300 transition-colors disabled:opacity-40"
            title="Export all rows to CSV"
          >
            {exporting ? <SpinIcon /> : <DownloadIcon />}
            <span>{exporting ? 'Exporting…' : 'Export all'}</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-lg border border-gray-700/60 max-h-[56vh]">
        <table
          className="text-xs text-left border-collapse"
          style={{ tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}
        >
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-800">
              {columns.map((col) => (
                <HeaderCell
                  key={col}
                  col={col}
                  width={getWidth(col)}
                  onResizeStart={startResize}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className={`border-b border-gray-800/50 hover:bg-indigo-950/20 transition-colors ${
                  i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-900/50'
                }`}
              >
                {columns.map((col) => (
                  <Cell
                    key={col}
                    value={row[col]}
                    rowIndex={i}
                    col={col}
                    copied={copied}
                    onCopy={copy}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
