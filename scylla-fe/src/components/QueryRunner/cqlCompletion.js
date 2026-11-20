/**
 * Schema-aware CQL autocomplete.
 *
 *   keyspace.|       → tables of that keyspace
 *   FROM |           → keyspaces (and tables of the selected keyspace)
 *   anything else    → columns of the table named in the statement's FROM
 *                      (or of the sidebar's selected table before a FROM is typed)
 *
 * Metadata comes from the shared catalog cache, so each list is fetched once
 * per session. CQL keywords are completed separately by @codemirror/lang-sql.
 */
import { startCompletion } from '@codemirror/autocomplete'
import { fetchKeyspaces, fetchSchema, fetchTables } from '../../services/catalog.js'
import { statementAt } from '../../services/cqlStatements.js'

const KIND_LABEL = { partition_key: 'partition key', clustering: 'clustering', static: 'static' }
const KIND_BOOST = { partition_key: 30, clustering: 20, static: 5 }

const unquote = (s) => (s?.startsWith('"') ? s.slice(1, -1).replace(/""/g, '"') : s)
const IDENT = String.raw`("(?:[^"]|"")+"|[A-Za-z_]\w*)`
const FROM_RE = new RegExp(String.raw`\bFROM\s+${IDENT}(?:\s*\.\s*${IDENT})?`, 'i')

async function safe(promise) {
  try {
    return await promise
  } catch {
    return null
  }
}

function tableOptions(tables, keyspace) {
  return tables.map((t) => ({ label: t, type: 'class', detail: keyspace ? `table · ${keyspace}` : 'table', boost: 10 }))
}

/** @param {() => { keyspace: string|null, table: string|null }} getSelected  sidebar selection */
export function cqlCompletionSource(getSelected) {
  return async (ctx) => {
    const doc = ctx.state.doc.toString()
    let stmt = statementAt(doc, ctx.pos)
    // Past a finished statement's `;` the user is starting a new one.
    if (stmt && (stmt.from > ctx.pos || (stmt.text.endsWith(';') && ctx.pos >= stmt.to))) stmt = null
    const stmtStart = stmt ? stmt.from : doc.lastIndexOf(';', ctx.pos - 1) + 1
    const before = doc.slice(stmtStart, ctx.pos)

    // Inside a string literal — nothing sensible to offer.
    if ((before.match(/'/g)?.length ?? 0) % 2 === 1) return null

    // keyspace.<partial> → tables
    const dotted = /("?[A-Za-z_]\w*"?)\.(\w*)$/.exec(before)
    if (dotted) {
      const keyspace = unquote(dotted[1])
      const tables = await safe(fetchTables(keyspace))
      if (!tables) return null
      return { from: ctx.pos - dotted[2].length, options: tableOptions(tables), validFor: /^\w*$/ }
    }

    const word = ctx.matchBefore(/\w*/)
    if (!word || (word.from === word.to && !ctx.explicit)) return null

    // After FROM / INTO / UPDATE / TABLE → keyspaces, plus tables of the selected keyspace
    if (/\b(FROM|INTO|UPDATE|TABLE|DESCRIBE|DESC)\s+\w*$/i.test(before)) {
      const selected = getSelected().keyspace
      const [keyspaces, tables] = await Promise.all([
        safe(fetchKeyspaces()),
        selected ? safe(fetchTables(selected)) : null,
      ])
      const options = (keyspaces ?? []).map((k) => ({
        label: k.name,
        type: 'namespace',
        detail: 'keyspace',
        boost: k.name.startsWith('system') ? -10 : 20,
        // Insert "keyspace." and immediately offer its tables.
        apply: (view, completion, from, to) => {
          view.dispatch({
            changes: { from, to, insert: `${completion.label}.` },
            selection: { anchor: from + completion.label.length + 1 },
          })
          startCompletion(view)
        },
      }))
      if (tables) {
        options.push(...tables.map((t) => ({
          label: `${selected}.${t}`,
          type: 'class',
          detail: 'table',
          boost: 5,
        })))
      }
      return { from: word.from, options, validFor: /^[\w.]*$/ }
    }

    // Columns of the statement's FROM table (the FROM may come after the cursor);
    // before any FROM is written, assume the table selected in the sidebar.
    const selected = getSelected()
    const from = stmt ? FROM_RE.exec(stmt.text) : null
    const keyspace = from ? (from[2] ? unquote(from[1]) : selected.keyspace) : selected.keyspace
    const table = from ? unquote(from[2] ?? from[1]) : selected.table
    if (!keyspace || !table) return null
    const schema = await safe(fetchSchema(keyspace, table))
    if (!schema) return null
    return {
      from: word.from,
      options: schema.columns.map((c) => ({
        label: c.name,
        type: 'property',
        detail: KIND_LABEL[c.kind] ? `${c.type} · ${KIND_LABEL[c.kind]}` : c.type,
        boost: 40 + (KIND_BOOST[c.kind] ?? 0),
      })),
      validFor: /^\w*$/,
    }
  }
}
