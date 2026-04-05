import { useKeyspaces } from '../../hooks/useKeyspaces.js'
import KeyspaceTree from './KeyspaceTree.jsx'
import Spinner from '../ui/Spinner.jsx'

function DatabaseIcon() {
  return (
    <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7c0-1.657 3.582-3 8-3s8 1.343 8 3M4 7v10c0 1.657 3.582 3 8 3s8-1.343 8-3V7M4 7c0 1.657 3.582 3 8 3s8-1.343 8-3" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}

export default function Sidebar() {
  const { keyspaces, loading, error, reload } = useKeyspaces()

  return (
    <aside className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col h-full select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2 min-w-0">
          <DatabaseIcon />
          <span className="text-sm font-semibold text-white truncate">ScyllaScope</span>
        </div>
        <button
          className="text-gray-600 hover:text-gray-300 transition-colors disabled:opacity-30 flex-shrink-0 ml-1"
          onClick={reload}
          disabled={loading}
          title="Refresh keyspaces"
        >
          {loading ? <Spinner className="w-3.5 h-3.5 text-gray-500" /> : <RefreshIcon />}
        </button>
      </div>

      {/* Section label */}
      <div className="px-3 pt-3 pb-1">
        <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Keyspaces</span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-1 pb-2">
        {/* Error with retry */}
        {error && !loading && (
          <div className="mx-2 my-2 px-3 py-2.5 bg-red-950/40 border border-red-900/60 rounded-md">
            <p className="text-xs text-red-400 font-medium">Failed to load</p>
            <p className="text-xs text-red-500/60 mt-0.5 mb-2 leading-relaxed">{error}</p>
            <button
              onClick={reload}
              className="text-xs text-red-400 hover:text-red-300 underline underline-offset-2 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Skeleton on first load */}
        {loading && keyspaces.length === 0 && (
          <div className="space-y-1 px-2 pt-1">
            {[75, 55, 65, 45].map((w, i) => (
              <div
                key={i}
                className="h-6 rounded bg-gray-800 animate-pulse"
                style={{ width: `${w}%`, animationDelay: `${i * 80}ms` }}
              />
            ))}
          </div>
        )}

        {/* Tree */}
        {!loading && !error && <KeyspaceTree keyspaces={keyspaces} />}
      </div>
    </aside>
  )
}
