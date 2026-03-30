import { useRef, useState } from 'react'
import { useAppContext } from '../../context/AppContext.jsx'
import { useSchema } from '../../hooks/useSchema.js'
import Spinner from '../ui/Spinner.jsx'

// ─── Key type badge ───────────────────────────────────────────────────────────

const KIND_META = {
  partition_key: {
    label: 'partition',
    className: 'bg-indigo-600/20 text-indigo-300 border border-indigo-600/40',
  },
  clustering: {
    label: 'clustering',
    className: 'bg-violet-600/20 text-violet-300 border border-violet-600/40',
  },
  regular: {
    label: 'regular',
    className: 'bg-gray-800 text-gray-500 border border-gray-700',
  },
}

function KindBadge({ kind }) {
  const meta = KIND_META[kind] ?? KIND_META.regular
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  )
}

// ─── Example query with copy ──────────────────────────────────────────────────

function ExampleQuery({ keyspace, table }) {
  const { setQuery } = useAppContext()
  const cql = `SELECT * FROM ${keyspace}.${table} LIMIT 10;`
  const [copied, setCopied] = useState(false)
  const timer = useRef(null)

  function handleCopy() {
    navigator.clipboard.writeText(cql).then(() => {
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="rounded-lg border border-gray-700/60 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-800 bg-gray-800/50">
        <span className="text-xs text-gray-500 font-medium">Example query</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setQuery(cql)}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Open in editor
          </button>
          <button
            onClick={handleCopy}
            className={`text-xs transition-colors ${copied ? 'text-green-400' : 'text-gray-500 hover:text-gray-300'}`}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
      <pre className="px-4 py-3 text-xs font-mono text-gray-300 bg-gray-900">{cql}</pre>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SchemaViewer() {
  const { selectedKeyspace, selectedTable } = useAppContext()
  const { schema, loading, error } = useSchema(selectedKeyspace, selectedTable)

  // No table selected yet
  if (!selectedKeyspace || !selectedTable) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <svg className="w-9 h-9 text-gray-700 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 4v16M4 4h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z" />
        </svg>
        <p className="text-sm text-gray-500">Select a table to view its schema</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-gray-600">
        <Spinner className="w-4 h-4 text-gray-600" />
        <span className="text-sm">Loading schema…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 flex gap-3">
        <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="min-w-0">
          <p className="text-xs font-medium text-red-400">Failed to load schema</p>
          <p className="text-xs text-red-500/70 mt-0.5 font-mono">{error}</p>
        </div>
      </div>
    )
  }

  if (!schema) return null

  const { columns = [] } = schema
  const partitionKeys = columns.filter((c) => c.kind === 'partition_key')
  const clusteringKeys = columns.filter((c) => c.kind === 'clustering')
  const regularCols = columns.filter((c) => c.kind === 'regular')

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-baseline gap-3">
        <h2 className="text-sm font-semibold text-white">
          {schema.table_name ?? selectedTable}
        </h2>
        <span className="text-xs text-gray-600">{selectedKeyspace}</span>
        <span className="ml-auto text-xs text-gray-600 tabular-nums">
          {columns.length} {columns.length === 1 ? 'column' : 'columns'}
        </span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3">
        {partitionKeys.length > 0 && <KindBadge kind="partition_key" />}
        {clusteringKeys.length > 0 && <KindBadge kind="clustering" />}
        {regularCols.length > 0 && <KindBadge kind="regular" />}
      </div>

      {/* Column table */}
      <div className="overflow-auto rounded-lg border border-gray-700/60">
        <table className="w-full text-xs text-left border-collapse">
          <thead className="sticky top-0 bg-gray-800">
            <tr>
              <th className="px-3 py-2 text-gray-400 font-medium border-b border-gray-700 w-8 text-center">#</th>
              <th className="px-3 py-2 text-gray-400 font-medium border-b border-gray-700">Column</th>
              <th className="px-3 py-2 text-gray-400 font-medium border-b border-gray-700">Type</th>
              <th className="px-3 py-2 text-gray-400 font-medium border-b border-gray-700">Key</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((col, i) => {
              const isPartition = col.kind === 'partition_key'
              const isClustering = col.kind === 'clustering'

              return (
                <tr
                  key={col.name}
                  className={`
                    border-b border-gray-800/60 transition-colors
                    ${isPartition ? 'bg-indigo-950/20 hover:bg-indigo-950/40' : ''}
                    ${isClustering ? 'bg-violet-950/20 hover:bg-violet-950/40' : ''}
                    ${!isPartition && !isClustering ? 'hover:bg-gray-800/40' : ''}
                  `}
                >
                  <td className="px-3 py-2 text-gray-700 text-center tabular-nums">{i + 1}</td>
                  <td className={`px-3 py-2 font-mono font-medium ${isPartition ? 'text-indigo-300' : isClustering ? 'text-violet-300' : 'text-gray-300'}`}>
                    {col.name}
                  </td>
                  <td className="px-3 py-2 font-mono text-gray-500">{col.type}</td>
                  <td className="px-3 py-2">
                    <KindBadge kind={col.kind} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Example query */}
      <ExampleQuery keyspace={selectedKeyspace} table={selectedTable} />
    </div>
  )
}
