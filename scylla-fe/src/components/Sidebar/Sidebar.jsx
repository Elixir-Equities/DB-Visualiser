import { useEffect, useRef, useState } from 'react'
import { useKeyspaces } from '../../hooks/useKeyspaces.js'
import { useAppContext } from '../../context/AppContext.jsx'
import { loadPref, savePref } from '../../services/storage.js'
import { invalidateCatalog } from '../../services/catalog.js'
import KeyspaceTree, { handleTreeKeys } from './KeyspaceTree.jsx'
import Spinner from '../ui/Spinner.jsx'
import { ChevronRightIcon, CloseIcon, DatabaseIcon, RefreshIcon, SearchIcon, SidebarIcon } from '../ui/icons.jsx'

const MIN_WIDTH = 200
const MAX_WIDTH = 480
const DEFAULT_WIDTH = 260

const isSystemKeyspace = (name) => name.startsWith('system')

function iconButton(extra = '') {
  return `p-1.5 rounded-md text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors disabled:opacity-30 ${extra}`
}

/** Drag the sidebar's right edge to resize it. */
function useResizableWidth() {
  const [width, setWidth] = useState(() => {
    const saved = loadPref('sidebarWidth', DEFAULT_WIDTH)
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Number(saved) || DEFAULT_WIDTH))
  })
  useEffect(() => { savePref('sidebarWidth', width) }, [width])

  function startResize(e) {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = width
    const onMove = (ev) => setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + ev.clientX - startX)))
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return { width, startResize }
}

export default function Sidebar() {
  const { keyspaces, loading, error, reload } = useKeyspaces()
  const { selectedKeyspace } = useAppContext()
  const { width, startResize } = useResizableWidth()

  const [collapsed, setCollapsed] = useState(() => loadPref('sidebarCollapsed', false))
  const [filter, setFilter] = useState('')
  const [version, setVersion] = useState(0)
  const [showSystem, setShowSystem] = useState(
    () => loadPref('showSystemKeyspaces', false) || isSystemKeyspace(selectedKeyspace ?? ''),
  )
  const [openSet, setOpenSet] = useState(() => {
    const saved = new Set(loadPref('openKeyspaces', []))
    if (selectedKeyspace) saved.add(selectedKeyspace)
    return saved
  })

  const filterRef = useRef(null)
  const treeRef = useRef(null)

  useEffect(() => { savePref('sidebarCollapsed', collapsed) }, [collapsed])
  useEffect(() => { savePref('showSystemKeyspaces', showSystem) }, [showSystem])
  useEffect(() => { savePref('openKeyspaces', [...openSet]) }, [openSet])

  // "/" focuses the table filter from anywhere outside a text field.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return
      e.preventDefault()
      setCollapsed(false)
      requestAnimationFrame(() => filterRef.current?.focus())
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function toggle(name) {
    setOpenSet((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  function refresh() {
    invalidateCatalog()
    setVersion((v) => v + 1)
    reload()
  }

  function onFilterKeyDown(e) {
    if (e.key === 'Escape') {
      if (filter) setFilter('')
      else e.currentTarget.blur()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      treeRef.current?.querySelector('[data-tree-item]')?.focus()
    } else if (e.key === 'Enter') {
      // Open the first matching table.
      treeRef.current?.querySelector('[data-tree-table]')?.click()
    }
  }

  const query = filter.trim().toLowerCase()
  const userKeyspaces = keyspaces.filter((k) => !isSystemKeyspace(k.name))
  const systemKeyspaces = keyspaces.filter((k) => isSystemKeyspace(k.name))
  // Filtering searches system keyspaces too, even when the section is collapsed.
  const systemOpen = showSystem || query.length > 0

  if (collapsed) {
    return (
      <aside className="w-11 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col items-center gap-1 py-2">
        <button onClick={() => setCollapsed(false)} className={iconButton()} aria-label="Expand sidebar" title="Expand sidebar">
          <SidebarIcon className="w-4 h-4" />
        </button>
        <button
          onClick={() => { setCollapsed(false); requestAnimationFrame(() => filterRef.current?.focus()) }}
          className={iconButton()}
          aria-label="Find table"
          title="Find table (/)"
        >
          <SearchIcon className="w-4 h-4" />
        </button>
      </aside>
    )
  }

  return (
    <aside
      className="relative flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col h-full"
      style={{ width }}
    >
      {/* Header */}
      <div className="flex items-center gap-1 pl-3 pr-1.5 h-12 border-b border-gray-800 flex-shrink-0">
        <DatabaseIcon className="w-4 h-4 text-indigo-400" />
        <span className="ml-1 text-sm font-semibold text-white truncate mr-auto">ScyllaScope</span>
        <button className={iconButton()} onClick={refresh} disabled={loading} aria-label="Refresh keyspaces" title="Refresh keyspaces and tables">
          {loading ? <Spinner className="w-3.5 h-3.5" /> : <RefreshIcon className="w-3.5 h-3.5" />}
        </button>
        <button className={iconButton()} onClick={() => setCollapsed(true)} aria-label="Collapse sidebar" title="Collapse sidebar">
          <SidebarIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Filter */}
      <div className="px-2 pt-2 pb-1 flex-shrink-0">
        <div className="relative">
          <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
          <input
            ref={filterRef}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={onFilterKeyDown}
            placeholder="Find table…"
            aria-label="Find keyspace or table"
            className="w-full rounded-md bg-gray-950/70 border border-gray-800 pl-7 pr-7 py-1.5 text-[13px] text-gray-100 placeholder-gray-500 outline-none focus:border-indigo-500/60 transition-colors"
          />
          {filter ? (
            <button
              onClick={() => { setFilter(''); filterRef.current?.focus() }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-white"
              aria-label="Clear filter"
            >
              <CloseIcon className="w-3 h-3" />
            </button>
          ) : (
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-gray-700 px-1 text-[10px] text-gray-500 pointer-events-none">/</kbd>
          )}
        </div>
      </div>

      {/* Tree */}
      <div
        ref={treeRef}
        role="tree"
        aria-label="Keyspaces and tables"
        onKeyDown={(e) => handleTreeKeys(e, treeRef.current)}
        className="flex-1 overflow-y-auto px-1.5 pb-3 select-none"
      >
        {error && !loading && (
          <div className="mx-1 my-2 px-3 py-2.5 bg-red-950/40 border border-red-900/60 rounded-md">
            <p className="text-xs text-red-200 font-medium">Couldn't load keyspaces</p>
            <p className="text-xs text-red-300/80 mt-0.5 mb-2 leading-relaxed break-words">{error}</p>
            <button onClick={refresh} className="text-xs text-red-200 hover:text-white underline underline-offset-2">
              Retry
            </button>
          </div>
        )}

        {loading && keyspaces.length === 0 && (
          <div className="space-y-1.5 px-2 pt-2">
            {[75, 55, 65, 45].map((w, i) => (
              <div key={i} className="h-5 rounded bg-gray-800 animate-pulse" style={{ width: `${w}%`, animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
        )}

        {!loading && !error && keyspaces.length === 0 && (
          <p className="px-3 py-8 text-center text-xs text-gray-500">No keyspaces found</p>
        )}

        {!error && keyspaces.length > 0 && (
          <>
            <p className="px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Keyspaces
            </p>
            {userKeyspaces.length > 0 ? (
              <KeyspaceTree keyspaces={userKeyspaces} query={query} openSet={openSet} onToggle={toggle} version={version} />
            ) : (
              <p className="px-2 py-1 text-xs text-gray-500">Only system keyspaces exist.</p>
            )}

            {systemKeyspaces.length > 0 && (
              <div className="mt-3">
                <button
                  onClick={() => setShowSystem((s) => !s)}
                  aria-expanded={systemOpen}
                  className="w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                >
                  <ChevronRightIcon className={`w-3 h-3 transition-transform ${systemOpen ? 'rotate-90' : ''}`} />
                  System
                  <span className="ml-auto font-normal normal-case tracking-normal tabular-nums">{systemKeyspaces.length}</span>
                </button>
                {systemOpen && (
                  <KeyspaceTree keyspaces={systemKeyspaces} query={query} openSet={openSet} onToggle={toggle} version={version} />
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={startResize}
        onDoubleClick={() => setCollapsed(true)}
        className="absolute top-0 -right-1 w-2 h-full cursor-col-resize z-20 group"
        title="Drag to resize · double-click to collapse"
        aria-hidden="true"
      >
        <div className="mx-auto w-px h-full group-hover:bg-indigo-500/70 transition-colors" />
      </div>
    </aside>
  )
}
