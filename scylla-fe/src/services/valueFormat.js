/**
 * How a result value should be shown. The backend sends collections as real
 * JSON (maps → objects, lists/sets/tuples → arrays) and masked values as
 * `<masked: …>` placeholder strings, so `String(value)` is not enough.
 */
const MASKED_RE = /^<masked: (.+)>$/

/**
 * @returns {{ kind: 'null'|'masked'|'boolean'|'number'|'json'|'text', text: string|null, label?: string }}
 *   `text` is the full copyable representation (null for null values).
 */
export function describeValue(value) {
  if (value === null || value === undefined) return { kind: 'null', text: null }
  if (typeof value === 'string') {
    const masked = MASKED_RE.exec(value)
    if (masked) return { kind: 'masked', text: value, label: masked[1] }
    return { kind: 'text', text: value }
  }
  if (typeof value === 'boolean') return { kind: 'boolean', text: String(value) }
  if (typeof value === 'number' || typeof value === 'bigint') return { kind: 'number', text: String(value) }
  if (typeof value === 'object') return { kind: 'json', text: safeStringify(value) }
  return { kind: 'text', text: String(value) }
}

/**
 * Multi-line form used by the row inspector. Text columns that hold JSON
 * (common for denormalised blobs) are pretty-printed too.
 */
export function prettyValue(value) {
  if (value !== null && typeof value === 'object') return safeStringify(value, 2)
  const { kind, text } = describeValue(value)
  if (kind === 'text' && /^\s*[[{]/.test(text)) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      /* Not JSON after all — show as is. */
    }
  }
  return text
}

function safeStringify(value, indent) {
  try {
    return JSON.stringify(value, null, indent)
  } catch {
    return String(value)
  }
}

/** Text colour per value kind, shared by the grid and the inspector. */
export const VALUE_CLASS = {
  text: 'text-gray-200',
  number: 'text-sky-300 tabular-nums',
  boolean: 'text-amber-300',
  json: 'text-emerald-300',
}

/** Rough pixel width of a column, from its header and a sample of values. */
export function estimateColumnWidth(col, rows) {
  const CHAR_PX = 7.4 // 12px monospace
  let longest = col.length + 2 // header (+ sort/key markers)
  const sample = rows.length > 50 ? rows.slice(0, 50) : rows
  for (const row of sample) {
    const { text } = describeValue(row[col])
    if (text && text.length > longest) longest = text.length
    if (longest >= 48) break
  }
  return Math.round(Math.min(380, Math.max(80, longest * CHAR_PX + 28)))
}
