/** Decode a complete query response, including heartbeat-only SSE frames. */
export function decodeQueryResponse(body) {
  if (typeof body !== 'string') return body
  const text = body.trim()
  // Preserve compatibility with a backend that returns ordinary JSON.
  if (text.startsWith('{')) return JSON.parse(text)

  for (const frame of text.replace(/\r\n/g, '\n').split('\n\n')) {
    const lines = frame.split('\n')
    const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim()
    if (event !== 'result') continue
    const data = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
    return JSON.parse(data)
  }
  throw new Error('Query connection closed before a result was received')
}
