// A service worker turns an authenticated fetch body into a native download.
// Only the CSV stream crosses this boundary; credentials stay in apiClient.
let workerPromise

function timeout(promise, milliseconds, message) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds) }),
  ]).finally(() => clearTimeout(timer))
}

async function getDownloadWorker() {
  if (!window.isSecureContext || !navigator.serviceWorker || !window.MessageChannel) return null
  if (!workerPromise) {
    workerPromise = timeout((async () => {
      const registration = await navigator.serviceWorker.register('/csv-download-worker.js', { scope: '/' })
      if (registration.active?.state === 'activated') return registration.active
      const worker = registration.installing ?? registration.waiting ?? registration.active
      if (!worker) throw new Error('Download worker is unavailable')
      await new Promise((resolve, reject) => {
        const onState = () => {
          if (worker.state === 'activated' || worker.state === 'redundant') {
            worker.removeEventListener('statechange', onState)
            worker.state === 'activated' ? resolve() : reject(new Error('Download worker failed'))
          }
        }
        worker.addEventListener('statechange', onState)
        onState()
      })
      return worker
    })(), 10000, 'Download worker did not start').catch(() => {
      workerPromise = null
      return null
    })
  }
  return workerPromise
}

function filename(response) {
  const name = /filename="?([^";]+)"?/i.exec(response.headers.get('Content-Disposition') ?? '')?.[1]
  return name?.replace(/[^a-zA-Z0-9._-]/g, '_') || 'query-all-rows.csv'
}

async function downloadBlob(response, name) {
  // Compatibility path for browsers/privacy settings without service workers
  // or transferable streams. It still exports every row, but buffers the file.
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

export async function downloadCSVStream(response) {
  const name = filename(response)
  const worker = await getDownloadWorker()
  if (!worker || !response.body) return downloadBlob(response, name)

  const channel = new MessageChannel()
  const id = crypto.randomUUID()
  const iframe = document.createElement('iframe')
  iframe.hidden = true
  let timer
  let handedOff = false

  const finished = new Promise((resolve, reject) => {
    const fail = (message) => reject(new Error(message))
    channel.port1.onmessage = ({ data }) => {
      if (data.type === 'ready') {
        iframe.src = `/__csv-download__/${id}`
        document.body.appendChild(iframe)
      } else if (data.type === 'started') {
        clearTimeout(timer)
      } else if (data.type === 'done') {
        resolve()
      } else if (data.type === 'error') {
        fail(data.message || 'Export download failed')
      }
    }
    timer = setTimeout(() => fail('Export download did not start'), 30000)
    try {
      worker.postMessage({ type: 'csv-download', id, name, stream: response.body }, [response.body, channel.port2])
      handedOff = true
    } catch {
      // Unsupported stream transfer does not consume/detach the response.
      clearTimeout(timer)
      resolve()
    }
  })

  try {
    await finished
    if (!handedOff) await downloadBlob(response, name)
  } finally {
    clearTimeout(timer)
    if (handedOff) channel.port1.postMessage({ type: 'cancel' })
    channel.port1.close()
    if (!handedOff) channel.port2.close()
    iframe.remove()
  }
}
