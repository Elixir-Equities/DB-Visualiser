import { useEffect, useState } from 'react'
import Sidebar from '../components/Sidebar/Sidebar.jsx'
import QueryRunner from '../components/QueryRunner/QueryRunner.jsx'
import ResultsTable from '../components/ResultsTable/ResultsTable.jsx'
import SchemaViewer from '../components/SchemaViewer/SchemaViewer.jsx'
import { useAppContext } from '../context/AppContext.jsx'

const TABS = [
  { id: 'query', label: 'Query' },
  { id: 'schema', label: 'Schema' },
]

function Breadcrumb() {
  const { selectedKeyspace, selectedTable } = useAppContext()
  return (
    <div className="flex items-center gap-2 px-5 py-2.5 border-b border-gray-800 bg-gray-900 min-h-[41px]">
      <span className="flex items-center gap-1.5 text-xs text-gray-600 flex-shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        Connected
      </span>
      {selectedKeyspace && (
        <>
          <span className="text-gray-800">/</span>
          <span className="text-xs text-gray-400 font-medium">{selectedKeyspace}</span>
          {selectedTable && (
            <>
              <span className="text-gray-800">/</span>
              <span className="text-xs text-gray-300 font-medium">{selectedTable}</span>
            </>
          )}
        </>
      )}
    </div>
  )
}

function TabBar({ active, onChange }) {
  return (
    <div className="flex items-center gap-1 px-5 border-b border-gray-800 bg-gray-900">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`
            px-3 py-2 text-xs font-medium border-b-2 transition-colors
            ${active === tab.id
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-gray-500 hover:text-gray-300'
            }
          `}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export default function MainPage() {
  const { selectedTable } = useAppContext()
  const [activeTab, setActiveTab] = useState('query')

  // Auto-switch to schema tab when a table is selected from the sidebar
  useEffect(() => {
    if (selectedTable) setActiveTab('schema')
  }, [selectedTable])

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Breadcrumb />
        <TabBar active={activeTab} onChange={setActiveTab} />

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {activeTab === 'query' && (
            <>
              <QueryRunner />
              <ResultsTable />
            </>
          )}
          {activeTab === 'schema' && <SchemaViewer />}
        </div>
      </main>
    </div>
  )
}
