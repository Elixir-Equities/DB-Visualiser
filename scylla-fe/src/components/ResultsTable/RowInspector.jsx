import { useEffect, useRef } from 'react'
import { describeValue, prettyValue, VALUE_CLASS } from '../../services/valueFormat.js'
import { useCopy } from '../../hooks/useCopy.js'
import { CheckIcon, ChevronDownIcon, CloseIcon, CopyIcon } from '../ui/icons.jsx'
import { MaskedPill, NullValue } from './ValueView.jsx'
import { KEY_META } from '../SchemaViewer/keyMeta.js'

function Field({ name, value, kind, type, copied, onCopy }) {
  const v = describeValue(value)
  const pretty = prettyValue(value)
  const multiline = v.kind === 'json' || (pretty && (pretty.length > 60 || pretty.includes('\n')))
  const keyMeta = KEY_META[kind]

  return (
    <div className="group px-4 py-2.5 border-b border-gray-800/70">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-mono text-xs text-gray-300 truncate">{name}</span>
        {keyMeta && kind !== 'regular' && (
          <span className={`rounded px-1 text-[10px] font-medium ${keyMeta.badge}`}>{keyMeta.short}</span>
        )}
        {type && <span className="font-mono text-[11px] text-gray-500">{type}</span>}
        {v.text !== null && (
          <button
            onClick={() => onCopy(name, v.text)}
            className={`ml-auto p-1 rounded transition-opacity ${
              copied === name
                ? 'text-emerald-400 opacity-100'
                : 'text-gray-500 hover:text-gray-200 hover:bg-gray-800 opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
            }`}
            aria-label={`Copy ${name}`}
          >
            {copied === name ? <CheckIcon className="w-3 h-3" /> : <CopyIcon className="w-3 h-3" />}
          </button>
        )}
      </div>
      {v.kind === 'null' && <NullValue />}
      {v.kind === 'masked' && <MaskedPill label={v.label} />}
      {v.kind !== 'null' && v.kind !== 'masked' && (
        multiline ? (
          <pre className={`font-mono text-xs whitespace-pre-wrap break-words rounded-md bg-gray-950/70 border border-gray-800 px-2.5 py-2 max-h-72 overflow-auto ${VALUE_CLASS[v.kind]}`}>
            {pretty}
          </pre>
        ) : (
          <p className={`font-mono text-xs break-words ${VALUE_CLASS[v.kind]}`}>{pretty}</p>
        )
      )}
    </div>
  )
}

/**
 * Side drawer with every field of one row, untruncated.
 * ↑/↓ (or k/j) step through rows; Esc closes.
 */
export default function RowInspector({ row, rowNumber, columns, columnInfo, onClose, onPrev, onNext }) {
  const { copied, copy } = useCopy()
  const panelRef = useRef(null)

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(e) {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); onNext?.() }
      else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); onPrev?.() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, onNext, onPrev])

  function copyRow() {
    const obj = Object.fromEntries(columns.map((c) => [c, row[c] ?? null]))
    copy('__row__', JSON.stringify(obj, null, 2))
  }

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      aria-label={`Row ${rowNumber}`}
      className="absolute inset-y-0 right-0 z-30 w-[min(30rem,92%)] flex flex-col border-l border-gray-700 bg-gray-900 shadow-2xl shadow-black/60 outline-none"
    >
      <div className="flex items-center gap-1 px-3 h-10 border-b border-gray-800 flex-shrink-0">
        <span className="text-sm font-medium text-gray-100 mr-auto">Row {rowNumber}</span>
        <button onClick={onPrev} disabled={!onPrev} aria-label="Previous row (↑)" title="Previous row (↑)"
          className="p-1.5 rounded text-gray-400 hover:text-gray-100 hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent">
          <ChevronDownIcon className="w-3.5 h-3.5 rotate-180" />
        </button>
        <button onClick={onNext} disabled={!onNext} aria-label="Next row (↓)" title="Next row (↓)"
          className="p-1.5 rounded text-gray-400 hover:text-gray-100 hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent">
          <ChevronDownIcon className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={copyRow}
          className={`ml-1 flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
            copied === '__row__' ? 'text-emerald-400' : 'text-gray-300 hover:text-white hover:bg-gray-800'
          }`}
        >
          {copied === '__row__' ? <CheckIcon className="w-3 h-3" /> : <CopyIcon className="w-3 h-3" />}
          {copied === '__row__' ? 'Copied' : 'Copy as JSON'}
        </button>
        <button onClick={onClose} aria-label="Close (Esc)" title="Close (Esc)"
          className="p-1.5 rounded text-gray-400 hover:text-gray-100 hover:bg-gray-800">
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {columns.map((col) => (
          <Field
            key={col}
            name={col}
            value={row[col]}
            kind={columnInfo[col]?.kind}
            type={columnInfo[col]?.type}
            copied={copied}
            onCopy={copy}
          />
        ))}
      </div>
    </aside>
  )
}
