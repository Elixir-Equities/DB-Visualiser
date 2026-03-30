import { useState } from 'react'
import { useTables } from '../../hooks/useTables.js'
import { useAppContext } from '../../context/AppContext.jsx'
import Spinner from '../ui/Spinner.jsx'

function ChevronIcon({ open }) {
  return (
    <svg
      className={`w-3 h-3 text-gray-600 flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}

function TableIcon({ selected }) {
  return (
    <svg
      className={`w-3 h-3 flex-shrink-0 ${selected ? 'text-indigo-300' : 'text-gray-600'}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18" />
    </svg>
  )
}

function TableItem({ name, keyspace }) {
  const { selectedKeyspace, selectedTable, selectTable } = useAppContext()
  const isSelected = selectedKeyspace === keyspace && selectedTable === name

  return (
    <li>
      <button
        className={`
          w-full flex items-center gap-2 px-2 py-1 rounded text-left transition-colors
          ${isSelected
            ? 'bg-indigo-600/90 text-white'
            : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'
          }
        `}
        onClick={() => selectTable(keyspace, name)}
      >
        <TableIcon selected={isSelected} />
        <span className="text-xs truncate">{name}</span>
      </button>
    </li>
  )
}

function KeyspaceNode({ keyspace }) {
  const [open, setOpen] = useState(false)
  const { tables, loading, error } = useTables(keyspace.name, { enabled: open })
  const { selectedKeyspace } = useAppContext()
  const hasSelection = selectedKeyspace === keyspace.name

  return (
    <div>
      <button
        className={`
          w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm font-medium transition-colors
          hover:bg-gray-800
          ${hasSelection ? 'text-indigo-400' : 'text-gray-300'}
        `}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronIcon open={open} />
        <span className="truncate">{keyspace.name}</span>
      </button>

      {open && (
        <div className="ml-3 pl-2 border-l border-gray-800 mt-0.5 mb-1 space-y-0.5">
          {loading && (
            <div className="flex items-center gap-2 px-1 py-1.5 text-xs text-gray-600">
              <Spinner className="w-3 h-3 text-gray-600" />
              Loading tables…
            </div>
          )}

          {error && !loading && (
            <div className="px-1 py-1.5">
              <p className="text-xs text-red-400">Failed to load tables</p>
              <p className="text-xs text-gray-600 mt-0.5 truncate">{error}</p>
            </div>
          )}

          {!loading && !error && tables.length === 0 && (
            <div className="px-1 py-2 text-xs text-gray-600 italic">
              No tables
            </div>
          )}

          {!loading && !error && tables.length > 0 && (
            <ul className="space-y-0.5 py-0.5">
              {tables.map((name) => (
                <TableItem key={name} name={name} keyspace={keyspace.name} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default function KeyspaceTree({ keyspaces }) {
  if (!keyspaces.length) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-600">
        <svg className="w-6 h-6 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <p className="text-xs">No keyspaces found</p>
      </div>
    )
  }

  return (
    <div className="space-y-0.5 py-1">
      {keyspaces.map((ks) => (
        <KeyspaceNode key={ks.name} keyspace={ks} />
      ))}
    </div>
  )
}
