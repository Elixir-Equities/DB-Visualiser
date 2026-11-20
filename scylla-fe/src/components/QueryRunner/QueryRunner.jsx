import { useCallback, useRef, useState } from 'react'
import { useAppContext } from '../../context/AppContext.jsx'
import { useDismiss } from '../../hooks/useDismiss.js'
import Spinner from '../ui/Spinner.jsx'
import SqlEditor, { runTarget } from './SqlEditor.jsx'
import { ChevronDownIcon, HistoryIcon, PlayIcon } from '../ui/icons.jsx'

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)
const RUN_KEYS = isMac ? '⌘↵' : 'Ctrl+↵'

function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

function HistoryMenu({ onPick }) {
  const { history, clearHistory } = useAppContext()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
      >
        <HistoryIcon className="w-3.5 h-3.5" />
        History
        <ChevronDownIcon className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-[min(36rem,80vw)] rounded-lg border border-gray-700 bg-gray-900 shadow-2xl shadow-black/50 overflow-hidden">
          {history.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-gray-500">Queries you run will appear here.</p>
          ) : (
            <>
              <ul className="max-h-80 overflow-y-auto py-1">
                {history.map((h) => (
                  <li key={h.at + h.query}>
                    <button
                      onClick={() => { onPick(h.query); setOpen(false) }}
                      className="w-full flex items-baseline gap-3 px-3 py-1.5 text-left hover:bg-gray-800 transition-colors"
                    >
                      <span className="flex-1 min-w-0 truncate font-mono text-xs text-gray-200">{h.query}</span>
                      <span className="flex-shrink-0 text-[11px] text-gray-500 tabular-nums">{timeAgo(h.at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex justify-end border-t border-gray-800 px-3 py-1.5">
                <button
                  onClick={() => { clearHistory(); setOpen(false) }}
                  className="text-xs text-gray-500 hover:text-red-300 transition-colors"
                >
                  Clear history
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const SCOPE_META = {
  selection: { button: 'Run selection', hint: 'Runs only the selected text' },
  statement: { button: 'Run statement', hint: 'Runs the highlighted statement' },
  all: { button: 'Run', hint: 'Ctrl+Space for suggestions · select text to run just that' },
}

export default function QueryRunner() {
  const { query, setQuery, execute, queryLoading, loadingPage, selectedKeyspace, selectedTable } = useAppContext()
  const viewRef = useRef(null)
  const [scope, setScope] = useState('all')

  // The editor's completion reads the selection lazily, so keep the latest in a ref.
  const selectionRef = useRef(null)
  selectionRef.current = { keyspace: selectedKeyspace, table: selectedTable }
  const getSelected = useCallback(() => selectionRef.current, [])

  const canRun = !queryLoading && query.trim().length > 0

  function runTargetText(target) {
    if (queryLoading || !target.text) return
    if (target.scope === 'all') execute()
    else execute(target.text, { syncEditor: false })
  }

  function runFromButton() {
    const view = viewRef.current
    runTargetText(view ? runTarget(view.state) : { text: query.trim(), scope: 'all' })
  }

  function focusEditor() {
    requestAnimationFrame(() => viewRef.current?.focus())
  }

  function pickFromHistory(q) {
    setQuery(q)
    focusEditor()
  }

  const running = queryLoading && loadingPage === 1
  const meta = SCOPE_META[scope] ?? SCOPE_META.all

  return (
    <section
      aria-label="CQL editor"
      className="flex-shrink-0 rounded-lg border border-gray-800 bg-gray-900 focus-within:border-gray-700 transition-colors"
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-gray-800">
        <span className="px-1.5 text-[11px] font-semibold tracking-wider text-gray-500 uppercase">CQL</span>
        <HistoryMenu onPick={pickFromHistory} />
        {query && (
          <button
            onClick={() => { setQuery(''); focusEditor() }}
            className="px-2 py-1 rounded-md text-xs text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
          >
            Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden md:inline text-xs text-gray-500">{meta.hint}</span>
          <button
            className="flex items-center gap-2 pl-2.5 pr-2 py-1 rounded-md text-xs font-medium transition-colors
              bg-indigo-600 hover:bg-indigo-500 text-white
              disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={runFromButton}
            disabled={!canRun}
            title={`${meta.button} (${RUN_KEYS})`}
          >
            {running ? <Spinner className="w-3 h-3" /> : <PlayIcon className="w-3 h-3" />}
            {running ? 'Running…' : meta.button}
            <kbd className="rounded bg-indigo-800/70 px-1 py-px text-[10px] font-sans text-indigo-100">{RUN_KEYS}</kbd>
          </button>
        </div>
      </div>

      {/* Editor — drag the bottom-right corner to make it taller */}
      <div className="h-32 min-h-[5.5rem] max-h-[60vh] resize-y overflow-hidden">
        <SqlEditor
          value={query}
          onChange={setQuery}
          onRun={runTargetText}
          onScopeChange={setScope}
          getSelected={getSelected}
          viewRef={viewRef}
          placeholder="SELECT * FROM keyspace.table WHERE partition_key = ? LIMIT 100;"
        />
      </div>
    </section>
  )
}
