// No caching, backend requests, or credentials. Only one-use CSV downloads
// are handled here; all other traffic keeps the application's normal routing.
const downloads = new Map()
const prefix = '/__csv-download__/'

self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('message', (event) => {
  const { type, id, name, stream } = event.data ?? {}
  const port = event.ports[0]
  if (type !== 'csv-download' || !port || !stream || !/^[a-f0-9-]{36}$/.test(id)) return
  if (!event.source?.url || new URL(event.source.url).origin !== self.location.origin) return

  const reader = stream.getReader()
  let finish
  const completed = new Promise((resolve) => { finish = resolve })
  let settled = false
  const job = {
    reader,
    port,
    name: String(name).replace(/[^a-zA-Z0-9._-]/g, '_'),
    completed,
    end(type, message) {
      if (settled) return
      settled = true
      clearTimeout(job.timer)
      downloads.delete(id)
      port.postMessage({ type, message })
      port.close()
      finish()
    },
  }
  const cancel = () => reader.cancel().catch(() => {})
  port.onmessage = ({ data }) => {
    if (data.type === 'cancel') {
      cancel()
      job.end('error', 'Export download cancelled')
    }
  }
  job.timer = setTimeout(() => {
    cancel()
    job.end('error', 'Export download did not start')
  }, 30000)
  downloads.set(id, job)
  event.waitUntil(completed)
  port.postMessage({ type: 'ready' })
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith(prefix)) return
  const job = downloads.get(url.pathname.slice(prefix.length))
  if (event.request.method !== 'GET' || !job) {
    event.respondWith(new Response('Download expired', { status: 404 }))
    return
  }
  downloads.delete(url.pathname.slice(prefix.length))
  clearTimeout(job.timer)
  job.port.postMessage({ type: 'started' })
  const body = new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await job.reader.read()
        if (done) {
          controller.close()
          job.end('done')
        } else {
          controller.enqueue(value)
        }
      } catch {
        controller.error(new Error('Export stream interrupted'))
        job.end('error', 'Export stream interrupted')
      }
    },
    async cancel() {
      await job.reader.cancel().catch(() => {})
      job.end('error', 'Export download cancelled')
    },
  })
  event.waitUntil(job.completed)
  event.respondWith(new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${job.name}"`,
      'Cache-Control': 'no-store',
    },
  }))
})
