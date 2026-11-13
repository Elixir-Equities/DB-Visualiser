import { useState } from 'react'
import { useAppContext } from '../../context/AppContext.jsx'
import { useSchema } from '../../hooks/useSchema.js'
import { useCopy } from '../../hooks/useCopy.js'
import { errorHint } from '../../services/errorHints.js'
import Spinner from '../ui/Spinner.jsx'
import { AlertIcon, CheckIcon, CopyIcon, EditIcon, PlayIcon, SearchIcon } from '../ui/icons.jsx'
import { KEY_META } from './keyMeta.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const quoteIdent = (name) => (/^[a-z_][a-z0-9_]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`)

/** A literal of the right shape for a CQL type, so templates read naturally. */
function placeholderFor(type = '') {
  const t = type.toLowerCase()
  if (/^(text|varchar|ascii|inet)$/.test(t)) return "'…'"
  if (/^(int|bigint|smallint|tinyint|varint|counter)$/.test(t)) return '0'
  if (/^(float|double|decimal)$/.test(t)) return '0.0'
  if (/^(uuid|timeuuid)$/.test(t)) return '00000000-0000-0000-0000-000000000000'
  if (t === 'boolean') return 'true'
  if (t === 'timestamp' || t === 'date') return "'2026-01-01'"
  return '?'
}

function partitionQuery(keyspace, table, partitionKeys) {
  const where = partitionKeys.map((c) => `${quoteIdent(c.name)} = ${placeholderFor(c.type)}`).join('\n  AND ')
  return `SELECT * FROM ${keyspace}.${table}\nWHERE ${where}\nLIMIT 100;`
}

function buildDDL(keyspace, table, columns) {
  const pk = columns.filter((c) => c.kind === 'partition_key').map((c) => quoteIdent(c.name))
  const ck = columns.filter((c) => c.kind === 'clustering').map((c) => quoteIdent(c.name))
  const width = Math.max(...columns.map((c) => quoteIdent(c.name).length))
  const lines = columns.map((c) => {
    const name = quoteIdent(c.name)
    return `  ${name.padEnd(width)}  ${c.type}${c.kind === 'static' ? ' STATIC' : ''},`
  })
  const partition = pk.length > 1 ? `(${pk.join(', ')})` : pk[0] ?? ''
  const primary = [partition, ...ck].filter(Boolean).join(', ')
  return `CREATE TABLE ${keyspace}.${table} (\n${lines.join('\n')}\n  PRIMARY KEY (${primary})\n);`
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function KindBadge({ kind }) {
  const meta = KEY_META[kind] ?? KEY_META.regular
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-px text-[11px] font-medium ${meta.badge}`}>
      {meta.label}
    </span>
  )
}

function CodeCard({ title, subtitle, code, actions }) {
  const { copied, copy } = useCopy()
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800">
        <div className="mr-auto min-w-0">
          <h3 className="text-xs font-medium text-gray-200">{title}</h3>
          {subtitle && <p className="text-[11px] text-gray-500">{subtitle}</p>}
        </div>
        {actions}
        <button
          onClick={() => copy('code', code)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors ${
            copied ? 'text-emerald-400' : 'text-gray-300 hover:text-white hover:bg-gray-800'
          }`}
        >
          {copied ? <CheckIcon className="w-3 h-3" /> : <CopyIcon className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="px-4 py-3 text-xs font-mono text-gray-200 overflow-auto max-h-80 leading-relaxed">{code}</pre>
    </section>
  )
}

function KeySummary({ label, cols, kind }) {
  if (cols.length === 0) return null
  const meta = KEY_META[kind]
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <span className="text-xs text-gray-400 flex-shrink-0">{label}</span>
      <span className={`font-mono text-xs truncate ${meta.text}`}>{cols.map((c) => c.name).join(', ')}</span>
    </div>
  )
}

const actionButton =
  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors'

// ─── Main component ───────────────────────────────────────────────────────────

export default function SchemaViewer() {
  const { selectedKeyspace, selectedTable, selectTable, openInEditor } = useAppContext()
  const { schema, loading, error } = useSchema(selectedKeyspace, selectedTable)
  const [filter, setFilter] = useState('')
  const { copied, copy } = useCopy()

  if (!selectedKeyspace || !selectedTable) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-2 text-center">
        <p className="text-sm text-gray-300">No table selected</p>
        <p className="text-xs text-gray-500">Pick a table in the sidebar to see its columns and keys.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-gray-400">
        <Spinner className="w-4 h-4" />
        <span className="text-sm">Loading schema…</span>
      </div>
    )
  }

  if (error) {
    const hint = errorHint(error)
    return (
      <div role="alert" className="rounded-lg border border-red-900/70 bg-red-950/30 px-4 py-3 flex gap-3">
        <AlertIcon className="w-4 h-4 text-red-400 mt-0.5" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-red-200">Couldn't load the schema</p>
          {hint && <p className="text-xs text-red-100/90">{hint}</p>}
          <p className="text-xs text-red-300/90 font-mono break-words">{error}</p>
        </div>
      </div>
    )
  }

  if (!schema) return null

  const { columns = [] } = schema
  const tableName = schema.table_name ?? selectedTable
  const partitionKeys = columns.filter((c) => c.kind === 'partition_key')
  const clusteringKeys = columns.filter((c) => c.kind === 'clustering')
  const q = filter.trim().toLowerCase()
  const shown = q ? columns.filter((c) => c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q)) : columns

  const pkQuery = partitionKeys.length ? partitionQuery(selectedKeyspace, tableName, partitionKeys) : null

  return (
    <div className="flex flex-col gap-4 max-w-6xl">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto min-w-0 space-y-1.5">
          <h2 className="flex items-baseline gap-2 min-w-0">
            <span className="text-base font-semibold text-white truncate">{tableName}</span>
            <span className="text-xs text-gray-400">in {selectedKeyspace}</span>
            <span className="text-xs text-gray-500 tabular-nums">· {columns.length} {columns.length === 1 ? 'column' : 'columns'}</span>
          </h2>
          <KeySummary label="Partition key" cols={partitionKeys} kind="partition_key" />
          <KeySummary label="Clustering" cols={clusteringKeys} kind="clustering" />
        </div>
        <div className="flex items-center gap-2">
          {pkQuery && (
            <button
              onClick={() => openInEditor(pkQuery)}
              className={`${actionButton} text-gray-200 border border-gray-700 hover:bg-gray-800`}
              title="Open a query filtered by the partition key in the editor"
            >
              <EditIcon className="w-3.5 h-3.5" />
              Query by partition key
            </button>
          )}
          <button
            onClick={() => selectTable(selectedKeyspace, selectedTable)}
            className={`${actionButton} bg-indigo-600 hover:bg-indigo-500 text-white`}
          >
            <PlayIcon className="w-3 h-3" />
            Preview data
          </button>
        </div>
      </div>

      {/* Columns */}
      <section className="rounded-lg border border-gray-800 overflow-hidden">
        {columns.length > 10 && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800 bg-gray-900">
            <SearchIcon className="w-3.5 h-3.5 text-gray-500" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter columns by name or type…"
              aria-label="Filter columns"
              className="flex-1 bg-transparent text-xs text-gray-100 placeholder-gray-500 outline-none"
            />
            {q && <span className="text-[11px] text-gray-500 tabular-nums">{shown.length} of {columns.length}</span>}
          </div>
        )}
        <table className="w-full text-xs text-left border-collapse">
          <thead className="bg-gray-800/80">
            <tr>
              <th scope="col" className="px-3 py-2 text-gray-400 font-medium w-10 text-right">#</th>
              <th scope="col" className="px-3 py-2 text-gray-400 font-medium">Column</th>
              <th scope="col" className="px-3 py-2 text-gray-400 font-medium">Type</th>
              <th scope="col" className="px-3 py-2 text-gray-400 font-medium w-36">Key</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((col) => {
              const meta = KEY_META[col.kind] ?? KEY_META.regular
              const index = columns.indexOf(col) + 1
              return (
                <tr key={col.name} className="group border-t border-gray-800/70 hover:bg-gray-900/80">
                  <td className="px-3 py-2 text-gray-500 text-right tabular-nums">{index}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => copy(col.name, col.name)}
                      className={`inline-flex items-center gap-1.5 font-mono font-medium ${meta.text} hover:underline underline-offset-2`}
                      title="Copy column name"
                    >
                      {col.name}
                      {copied === col.name
                        ? <CheckIcon className="w-3 h-3 text-emerald-400" />
                        : <CopyIcon className="w-3 h-3 text-gray-500 opacity-0 group-hover:opacity-100" />}
                    </button>
                  </td>
                  <td className="px-3 py-2 font-mono text-gray-300">{col.type}</td>
                  <td className="px-3 py-2">
                    {col.kind !== 'regular' && <KindBadge kind={col.kind} />}
                  </td>
                </tr>
              )
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-500">No columns match “{filter}”.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Queries & DDL */}
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        {pkQuery && (
          <CodeCard
            title="Query by partition key"
            subtitle="The efficient way to read this table — replace the placeholder values."
            code={pkQuery}
            actions={
              <button onClick={() => openInEditor(pkQuery)} className="px-2 py-1 rounded-md text-xs text-indigo-300 hover:text-indigo-200 hover:bg-gray-800">
                Open in editor
              </button>
            }
          />
        )}
        <CodeCard
          title="Table definition"
          subtitle="Reconstructed from columns — clustering order and table options not shown."
          code={buildDDL(selectedKeyspace, tableName, columns)}
        />
      </div>
    </div>
  )
}
