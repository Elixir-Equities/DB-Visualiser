import { useTables } from '../../hooks/useTables.js'
import { useAppContext } from '../../context/AppContext.jsx'
import Spinner from '../ui/Spinner.jsx'
import { ChevronRightIcon, DatabaseIcon, TableIcon } from '../ui/icons.jsx'

function Highlight({ text, query }) {
  if (!query) return text
  const at = text.toLowerCase().indexOf(query)
  if (at < 0) return text
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-amber-400/25 text-amber-100 rounded-sm">{text.slice(at, at + query.length)}</mark>
      {text.slice(at + query.length)}
    </>
  )
}

function TableItem({ name, keyspace, query }) {
  const { selectedKeyspace, selectedTable, selectTable } = useAppContext()
  const isSelected = selectedKeyspace === keyspace && selectedTable === name

  return (
    <li role="none">
      <button
        role="treeitem"
        aria-selected={isSelected}
        data-tree-item
        data-tree-table
        data-keyspace={keyspace}
        className={`
          relative w-full flex items-center gap-2 pl-2 pr-2 py-1 rounded-md text-left transition-colors
          ${isSelected
            ? 'bg-indigo-500/15 text-indigo-100 before:absolute before:left-0 before:inset-y-1 before:w-0.5 before:rounded-full before:bg-indigo-400'
            : 'text-gray-300 hover:bg-gray-800 hover:text-white'
          }
        `}
        onClick={() => selectTable(keyspace, name)}
        title={`${keyspace}.${name}`}
      >
        <TableIcon className={`w-3.5 h-3.5 ${isSelected ? 'text-indigo-300' : 'text-gray-500'}`} />
        <span className="text-[13px] truncate"><Highlight text={name} query={query} /></span>
      </button>
    </li>
  )
}

function KeyspaceNode({ keyspace, query, open, onToggle, version }) {
  const filtering = query.length > 0
  const { tables, loading, error, fetched } = useTables(keyspace.name, { enabled: open || filtering, version })
  const { selectedKeyspace } = useAppContext()
  const hasSelection = selectedKeyspace === keyspace.name

  const nameMatch = filtering && keyspace.name.toLowerCase().includes(query)
  const tableMatches = filtering ? tables.filter((t) => t.toLowerCase().includes(query)) : tables

  // While filtering, drop keyspaces that matched nothing once their tables are known.
  if (filtering && fetched && !nameMatch && tableMatches.length === 0) return null

  const expanded = filtering ? tableMatches.length > 0 || open : open
  const shownTables = filtering && !(nameMatch && open) ? tableMatches : tables

  function onKeyDown(e) {
    if (e.key === 'ArrowRight' && !expanded) { e.preventDefault(); onToggle() }
    if (e.key === 'ArrowLeft' && expanded) { e.preventDefault(); onToggle() }
  }

  return (
    <li role="none">
      <button
        role="treeitem"
        aria-expanded={expanded}
        data-tree-item
        data-keyspace-node={keyspace.name}
        className={`
          w-full flex items-center gap-1.5 px-1.5 py-1 rounded-md text-[13px] transition-colors hover:bg-gray-800
          ${hasSelection ? 'text-indigo-200' : 'text-gray-200'}
        `}
        onClick={onToggle}
        onKeyDown={onKeyDown}
      >
        <ChevronRightIcon className={`w-3 h-3 text-gray-500 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`} />
        <DatabaseIcon className={`w-3.5 h-3.5 ${hasSelection ? 'text-indigo-300' : 'text-gray-500'}`} />
        <span className="truncate font-medium"><Highlight text={keyspace.name} query={query} /></span>
        <span className="ml-auto pl-2 text-[11px] text-gray-500 tabular-nums">
          {loading ? <Spinner className="w-3 h-3" /> : fetched ? (filtering ? `${tableMatches.length}/${tables.length}` : tables.length) : ''}
        </span>
      </button>

      {expanded && (
        <div className="ml-[13px] pl-2 border-l border-gray-800 mt-0.5 mb-1">
          {error && !loading && (
            <div className="px-1 py-1.5">
              <p className="text-xs text-red-300">Couldn't load tables</p>
              <p className="text-xs text-gray-500 mt-0.5 truncate" title={error}>{error}</p>
            </div>
          )}
          {!loading && !error && fetched && tables.length === 0 && (
            <p className="px-1 py-1.5 text-xs text-gray-500 italic">No tables</p>
          )}
          {shownTables.length > 0 && (
            <ul role="group" className="space-y-px py-0.5">
              {shownTables.map((name) => (
                <TableItem key={name} name={name} keyspace={keyspace.name} query={query} />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

/** Up/Down move between visible tree rows; Left on a table jumps to its keyspace. */
export function handleTreeKeys(e, container) {
  if (!container) return
  const items = [...container.querySelectorAll('[data-tree-item]')]
  const at = items.indexOf(document.activeElement)
  if (at < 0) return
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    items[Math.min(items.length - 1, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus()
  } else if (e.key === 'ArrowLeft' && document.activeElement.dataset.treeTable !== undefined) {
    e.preventDefault()
    const ks = document.activeElement.dataset.keyspace
    container.querySelector(`[data-keyspace-node="${CSS.escape(ks)}"]`)?.focus()
  } else if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault()
    items[e.key === 'Home' ? 0 : items.length - 1]?.focus()
  }
}

export default function KeyspaceTree({ keyspaces, query, openSet, onToggle, version }) {
  return (
    <ul role="group" className="space-y-px">
      {keyspaces.map((ks) => (
        <KeyspaceNode
          key={ks.name}
          keyspace={ks}
          query={query}
          open={openSet.has(ks.name)}
          onToggle={() => onToggle(ks.name)}
          version={version}
        />
      ))}
    </ul>
  )
}
