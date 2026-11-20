import Sidebar from '../components/Sidebar/Sidebar.jsx'
import QueryRunner from '../components/QueryRunner/QueryRunner.jsx'
import ResultsTable from '../components/ResultsTable/ResultsTable.jsx'
import SchemaViewer from '../components/SchemaViewer/SchemaViewer.jsx'
import { useAppContext } from '../context/AppContext.jsx'
import { useHealth } from '../hooks/useHealth.js'
import { TableIcon } from '../components/ui/icons.jsx'

const TABS = [
  { id: 'data', label: 'Data' },
  { id: 'schema', label: 'Schema' },
]

const STATUS_META = {
  checking: { dot: 'bg-gray-500 animate-pulse', label: 'Checking…' },
  ok: { dot: 'bg-emerald-400', label: 'Connected' },
  down: { dot: 'bg-red-500', label: 'Unreachable' },
}

function ConnectionStatus() {
  const { status, message, recheck } = useHealth()
  const meta = STATUS_META[status]
  return (
    <button
      onClick={recheck}
      title={status === 'down' && message ? `${message} — click to re-check` : 'Click to re-check connection'}
      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
    >
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
      <span className={status === 'down' ? 'text-red-300' : ''}>{meta.label}</span>
    </button>
  )
}

function Breadcrumb() {
  const { selectedKeyspace, selectedTable } = useAppContext()
  if (!selectedKeyspace) {
    return <span className="text-sm text-gray-500">No table selected</span>
  }
  return (
    <nav aria-label="Current table" className="flex items-center gap-1.5 min-w-0 text-sm">
      <span className="text-gray-400 truncate">{selectedKeyspace}</span>
      {selectedTable && (
        <>
          <span className="text-gray-600" aria-hidden="true">/</span>
          <TableIcon className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-gray-100 font-medium truncate">{selectedTable}</span>
        </>
      )}
    </nav>
  )
}

function TabBar() {
  const { activeTab, setActiveTab } = useAppContext()
  return (
    <div role="tablist" aria-label="View" className="flex items-center gap-0.5 rounded-lg bg-gray-950/60 p-0.5 border border-gray-800">
      {TABS.map((tab) => {
        const active = activeTab === tab.id
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              active ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

export default function MainPage() {
  const { activeTab } = useAppContext()

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="flex items-center gap-4 px-4 h-12 border-b border-gray-800 bg-gray-900 flex-shrink-0">
          <div className="flex-1 min-w-0"><Breadcrumb /></div>
          <TabBar />
          <ConnectionStatus />
        </header>

        {activeTab === 'data' && (
          <div className="flex-1 min-h-0 flex flex-col gap-3 p-4">
            <QueryRunner />
            <ResultsTable />
          </div>
        )}
        {activeTab === 'schema' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            <SchemaViewer />
          </div>
        )}
      </main>
    </div>
  )
}
