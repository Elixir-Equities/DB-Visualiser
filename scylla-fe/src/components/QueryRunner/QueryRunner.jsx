import { useAppContext } from '../../context/AppContext.jsx'
import Spinner from '../ui/Spinner.jsx'

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)
const RUN_HINT = isMac ? '⌘ Return' : 'Ctrl+Enter'

function RunIcon() {
  return (
    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
      <path d="M5 3l14 9-14 9V3z" />
    </svg>
  )
}

function PrevIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function NextIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}

export default function QueryRunner() {
  const {
    query, setQuery,
    execute, nextPage, prevPage, reset,
    queryLoading, canPrev, canNext,
    currentPage, totalLabel, result,
  } = useAppContext()

  const canRun     = !queryLoading && query.trim().length > 0
  const isFetching = queryLoading   // generic loading flag for disabling nav

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      if (canRun) execute()
    }
  }

  return (
    <div className="rounded-lg overflow-hidden border border-gray-700/80 bg-gray-900 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 bg-gray-800/60">
        <span className="text-xs font-medium text-gray-500 tracking-wider uppercase">CQL Query</span>
        <span className="text-xs text-gray-700 hidden sm:block">{RUN_HINT} to run</span>
      </div>

      {/* Editor */}
      <textarea
        className="w-full bg-transparent text-gray-100 text-sm font-mono px-4 py-3 resize-none focus:outline-none placeholder-gray-700 leading-relaxed"
        rows={5}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="SELECT * FROM keyspace.table LIMIT 100;"
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
      />

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-gray-800 bg-gray-800/30">

        {/* Left — page navigation */}
        {result && (
          <div className="flex items-center gap-1">
            {/* Prev */}
            <button
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-500
                hover:text-white hover:bg-gray-700/60 transition-colors
                disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={prevPage}
              disabled={!canPrev || isFetching}
              title="Previous page (cached)"
            >
              <PrevIcon />
              Prev
            </button>

            {/* Page indicator */}
            <span className="px-2 py-1 text-xs tabular-nums text-gray-400 min-w-[90px] text-center">
              {totalLabel
                ? `Page ${currentPage} of ${totalLabel}`
                : `Page ${currentPage}`
              }
            </span>

            {/* Next */}
            <button
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-500
                hover:text-white hover:bg-gray-700/60 transition-colors
                disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={nextPage}
              disabled={!canNext}
              title={canNext ? 'Next page' : 'No more pages'}
            >
              {queryLoading && canNext ? (
                <Spinner className="w-3 h-3" />
              ) : (
                <NextIcon />
              )}
              Next
            </button>

            {/* Reset — jump back to page 1 from cache */}
            {currentPage > 1 && (
              <button
                className="ml-1 px-2 py-1 rounded text-xs text-gray-600
                  hover:text-gray-400 hover:bg-gray-700/40 transition-colors
                  disabled:opacity-30 disabled:cursor-not-allowed"
                onClick={reset}
                disabled={isFetching}
                title="Back to page 1 (no refetch)"
              >
                ↩ page 1
              </button>
            )}
          </div>
        )}

        {/* Spacer when no result yet */}
        {!result && <div />}

        {/* Right — Run */}
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors
            bg-indigo-600 hover:bg-indigo-500 text-white
            disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={() => execute()}
          disabled={!canRun}
        >
          {queryLoading && currentPage === 1 ? (
            <><Spinner className="w-3 h-3" />Running…</>
          ) : (
            <><RunIcon />Run</>
          )}
        </button>
      </div>
    </div>
  )
}
