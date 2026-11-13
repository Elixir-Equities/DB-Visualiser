import { useEffect, useRef } from 'react'
import { EditorState, Prec, RangeSetBuilder, StateField } from '@codemirror/state'
import {
  Decoration, EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter,
  keymap, lineNumbers, placeholder as placeholderExt,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { Cassandra, sql } from '@codemirror/lang-sql'
import { tags as t } from '@lezer/highlight'
import { splitStatements, statementAt } from '../../services/cqlStatements.js'
import { cqlCompletionSource } from './cqlCompletion.js'

// ─── Look ─────────────────────────────────────────────────────────────────────
// Colours follow the app palette (tailwind.config.js theme scale + accents).

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: '#a5b4fc', fontWeight: '600' }, // indigo-300
  { tag: [t.typeName, t.standard(t.name)], color: '#67e8f9' },                              // cyan-300
  { tag: [t.string, t.special(t.string)], color: '#6ee7b7' },                               // emerald-300
  { tag: [t.number, t.bool, t.null], color: '#7dd3fc' },                                    // sky-300
  { tag: [t.lineComment, t.blockComment], color: '#6a91a3', fontStyle: 'italic' },          // theme-500
  { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: '#92adb9' },           // theme-400
  { tag: [t.special(t.name), t.quote], color: '#fcd34d' },                                  // amber-300
  { tag: t.name, color: '#e1ebef' },                                                        // theme-200
])

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px', backgroundColor: 'transparent', color: '#e1ebef' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    lineHeight: '1.65',
    overflow: 'auto',
  },
  '.cm-content': { padding: '10px 0', caretColor: '#a5b4fc' },
  '.cm-line': { padding: '0 14px 0 6px' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#a5b4fc', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'rgba(99, 102, 241, 0.32) !important',
  },
  '.cm-activeLine': { backgroundColor: 'rgba(225, 235, 239, 0.035)' },
  '.cm-gutters': { backgroundColor: 'transparent', color: '#3d6071', border: 'none', paddingLeft: '6px' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#92adb9' },
  '.cm-placeholder': { color: '#3d6071' },
  '.cm-matchingBracket': { backgroundColor: 'rgba(129, 140, 248, 0.25)', outline: '1px solid rgba(129, 140, 248, 0.5)' },
  '.cm-nonmatchingBracket': { color: '#fca5a5' },
  // Statement that ⌘↵ will run, when the editor holds more than one.
  '.cm-runTarget': { boxShadow: 'inset 2px 0 0 #6366f1', backgroundColor: 'rgba(99, 102, 241, 0.06)' },
  // Autocomplete popup
  '.cm-tooltip': {
    backgroundColor: '#11242d', border: '1px solid #2a4b5a', borderRadius: '8px',
    boxShadow: '0 16px 40px rgba(0,0,0,0.55)', overflow: 'hidden',
  },
  '.cm-tooltip-autocomplete > ul': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12px', maxHeight: '16rem' },
  '.cm-tooltip-autocomplete > ul > li': { padding: '3px 10px 3px 6px', color: '#e1ebef' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'rgba(99, 102, 241, 0.3)', color: '#ffffff' },
  '.cm-completionDetail': { color: '#6a91a3', fontStyle: 'normal', marginLeft: '12px' },
  '.cm-completionMatchedText': { textDecoration: 'none', color: '#fcd34d' },
  '.cm-completionIcon': { opacity: '0.8', width: '1.2em', color: '#92adb9' },
  '.cm-completionIcon-namespace:after': { content: "'◆'", color: '#a5b4fc' },
  '.cm-completionIcon-class:after': { content: "'▦'", color: '#67e8f9' },
  '.cm-completionIcon-property:after': { content: "'•'", color: '#6ee7b7' },
  '.cm-completionIcon-keyword:after': { content: "'k'", color: '#a5b4fc' },
}, { dark: true })

// ─── Run-target highlight ─────────────────────────────────────────────────────

const runTargetLine = Decoration.line({ class: 'cm-runTarget' })

function runTargetDecorations(state) {
  const sel = state.selection.main
  const doc = state.doc.toString()
  if (!sel.empty || splitStatements(doc).length < 2) return Decoration.none
  const stmt = statementAt(doc, sel.head)
  if (!stmt) return Decoration.none
  const builder = new RangeSetBuilder()
  const first = state.doc.lineAt(stmt.from).number
  const last = state.doc.lineAt(Math.max(stmt.from, stmt.to - 1)).number
  for (let n = first; n <= last; n++) builder.add(state.doc.line(n).from, state.doc.line(n).from, runTargetLine)
  return builder.finish()
}

const runTargetField = StateField.define({
  create: runTargetDecorations,
  update: (deco, tr) => (tr.docChanged || tr.selection ? runTargetDecorations(tr.state) : deco),
  provide: (f) => EditorView.decorations.from(f),
})

// ─── What ⌘↵ runs ─────────────────────────────────────────────────────────────

/**
 * The text to run and a label for it: the selection if there is one, else the
 * statement under the cursor when there are several, else the whole editor.
 */
export function runTarget(state) {
  const doc = state.doc.toString()
  const sel = state.selection.main
  if (!sel.empty) {
    const text = state.sliceDoc(sel.from, sel.to).trim()
    if (text) return { text, scope: 'selection' }
  }
  const statements = splitStatements(doc)
  if (statements.length > 1) {
    const stmt = statementAt(doc, sel.head)
    if (stmt) return { text: stmt.text, scope: 'statement' }
  }
  return { text: doc.trim(), scope: 'all' }
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * CodeMirror 6 CQL editor.
 *
 * @param {object} props
 * @param {string} props.value               editor text (kept in sync both ways)
 * @param {(v: string) => void} props.onChange
 * @param {(target: { text: string, scope: 'selection'|'statement'|'all' }) => void} props.onRun   ⌘/Ctrl+Enter
 * @param {(scope: string) => void} [props.onScopeChange]  what ⌘↵ would run right now
 * @param {() => { keyspace: string|null, table: string|null }} props.getSelected  sidebar selection, used as completion context
 * @param {{ current: EditorView|null }} [props.viewRef]   receives the EditorView
 * @param {string} [props.placeholder]
 */
export default function SqlEditor({ value, onChange, onRun, onScopeChange, getSelected, viewRef, placeholder }) {
  const hostRef = useRef(null)
  const view = useRef(null)
  // Extensions are built once; route callbacks through refs so they stay current.
  const callbacks = useRef({})
  callbacks.current = { onChange, onRun, onScopeChange, getSelected }

  useEffect(() => {
    const completion = cqlCompletionSource(() => callbacks.current.getSelected?.() ?? { keyspace: null, table: null })
    let lastScope = null

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        EditorView.lineWrapping,
        sql({ dialect: Cassandra, upperCaseKeywords: true }),
        Cassandra.language.data.of({ autocomplete: completion }),
        autocompletion({ activateOnTyping: true, icons: true, maxRenderedOptions: 80 }),
        syntaxHighlighting(highlight),
        theme,
        runTargetField,
        placeholderExt(placeholder ?? ''),
        EditorView.contentAttributes.of({ 'aria-label': 'CQL query', spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off' }),
        Prec.highest(keymap.of([
          {
            key: 'Mod-Enter',
            preventDefault: true,
            run: (v) => {
              const target = runTarget(v.state)
              if (target.text) callbacks.current.onRun?.(target)
              return true
            },
          },
        ])),
        keymap.of([...closeBracketsKeymap, ...completionKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) callbacks.current.onChange?.(u.state.doc.toString())
          if (u.docChanged || u.selectionSet) {
            const scope = runTarget(u.state).scope
            if (scope !== lastScope) {
              lastScope = scope
              callbacks.current.onScopeChange?.(scope)
            }
          }
        }),
      ],
    })

    view.current = new EditorView({ state, parent: hostRef.current })
    if (viewRef) viewRef.current = view.current
    return () => {
      view.current?.destroy()
      view.current = null
      if (viewRef) viewRef.current = null
    }
    // Built once per mount; `value` changes are synced by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Outside changes (history pick, "Open in editor", table click) replace the doc.
  useEffect(() => {
    const v = view.current
    if (!v) return
    const current = v.state.doc.toString()
    if (current === value) return
    v.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      selection: { anchor: value.length },
    })
  }, [value])

  return <div ref={hostRef} className="h-full" />
}
