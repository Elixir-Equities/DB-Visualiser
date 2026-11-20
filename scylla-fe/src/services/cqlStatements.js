/**
 * Split CQL text into statements on `;`, ignoring semicolons inside
 * 'strings', "quoted identifiers", $$dollar strings$$ and comments
 * (-- … , // … , /* … *\/).
 *
 * @returns {Array<{ from: number, to: number, text: string }>} trimmed,
 *   non-empty statements; `from`/`to` are offsets into `text` (to exclusive,
 *   including the terminating `;` when present).
 */
export function splitStatements(text) {
  const out = []
  let start = 0
  let i = 0
  const n = text.length

  function push(end) {
    const raw = text.slice(start, end)
    const lead = raw.length - raw.trimStart().length
    const body = raw.trim()
    if (body && body !== ';') out.push({ from: start + lead, to: start + lead + body.length, text: body })
  }

  while (i < n) {
    const c = text[i]
    const next = text[i + 1]
    if (c === "'" || c === '"') {
      // Quote is escaped by doubling it.
      i++
      while (i < n) {
        if (text[i] === c) {
          if (text[i + 1] === c) { i += 2; continue }
          break
        }
        i++
      }
      i++
    } else if (c === '$' && next === '$') {
      const close = text.indexOf('$$', i + 2)
      i = close < 0 ? n : close + 2
    } else if ((c === '-' && next === '-') || (c === '/' && next === '/')) {
      const nl = text.indexOf('\n', i)
      i = nl < 0 ? n : nl + 1
    } else if (c === '/' && next === '*') {
      const close = text.indexOf('*/', i + 2)
      i = close < 0 ? n : close + 2
    } else if (c === ';') {
      push(i + 1)
      start = i + 1
      i++
    } else {
      i++
    }
  }
  push(n)
  return out
}

/**
 * The statement the cursor is in. A cursor in the gap after a statement's
 * `;` belongs to that statement (the usual "just finished typing" case).
 */
export function statementAt(text, pos) {
  const statements = splitStatements(text)
  if (statements.length === 0) return null
  let best = statements[0]
  for (const s of statements) {
    if (s.from <= pos) best = s
    else break
  }
  return best
}
