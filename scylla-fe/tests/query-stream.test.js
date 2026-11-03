import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeQueryResponse } from '../src/services/queryStream.js'

const envelope = { success: true, data: { columns: ['count'], rows: [{ count: 42 }], row_count: 1 }, error: null }

test('heartbeats are ignored and the exact count is returned', () => {
  const stream = `: query started\n\n: keepalive\n\n: keepalive\n\nevent: result\ndata: ${JSON.stringify(envelope)}\n\n`
  assert.deepEqual(decodeQueryResponse(stream), envelope)
})

test('ordinary JSON backends and object responses stay compatible', () => {
  assert.deepEqual(decodeQueryResponse(JSON.stringify(envelope)), envelope)
  assert.equal(decodeQueryResponse(envelope), envelope)
})

test('streamed errors retain the backend error envelope', () => {
  const error = { success: false, data: null, error: { message: 'Unsafe projection', code: 'HTTP_400' } }
  assert.deepEqual(decodeQueryResponse(`: keepalive\n\nevent: result\ndata: ${JSON.stringify(error)}\n\n`), error)
})

test('CRLF frames, multiline data, and unicode are accepted', () => {
  const data = { ...envelope, data: { columns: ['合計'], rows: [{ 合計: 0 }], row_count: 1 } }
  const encoded = JSON.stringify(data, null, 2).split('\n').map((line) => `data: ${line}`).join('\r\n')
  assert.deepEqual(decodeQueryResponse(`: keepalive\r\n\r\nevent: result\r\n${encoded}\r\n\r\n`), data)
})

test('a dropped stream never produces a fabricated or partial count', () => {
  assert.throws(() => decodeQueryResponse(': keepalive\n\n'), /before a result/)
  assert.throws(() => decodeQueryResponse('event: result\ndata: {"success":'), SyntaxError)
})
