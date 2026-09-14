import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Readable, Transform } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { createForms, HttpError, type FormsConfig, type Upload } from './forms.ts'
import { selectLanguage } from './i18n.ts'
import { publicPage, publicPageHeaders } from './public-page.ts'

const MB = 1024 * 1024

export interface ServerConfig extends FormsConfig {
  maxUploadMb?: number
  /** Header carrying the client address set by the edge proxy, e.g. x-real-ip */
  clientIpHeader?: string
  submissionsPer10Min?: number
}

// In-process fixed windows, per instance only; use a shared limiter in front of
// several instances
function createRateLimiter() {
  const windows = new Map<string, { count: number; resetAt: number }>()
  setInterval(() => {
    const now = Date.now()
    for (const [key, window] of windows) {
      window.resetAt < now && windows.delete(key)
    }
  }, 60_000).unref()

  return (key: string, max: number, windowMs: number) => {
    const now = Date.now()
    const window = windows.get(key)
    if (!window || window.resetAt < now) {
      windows.set(key, { count: 1, resetAt: now + windowMs })
      return
    }
    if (++window.count > max) {
      throw new HttpError(429, 'tooManyRequests')
    }
  }
}

function limited(req: IncomingMessage, limit: number) {
  let size = 0
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      size += chunk.length
      callback(size > limit ? new HttpError(413, 'payloadTooLarge') : null, chunk)
    }
  })
  req.on('error', (e) => counter.destroy(e))
  return {
    stream: Readable.toWeb(req.pipe(counter)) as ReadableStream,
    exceeded: () => size > limit
  }
}

async function readBody(req: IncomingMessage, limit: number) {
  if (Number(req.headers['content-length'] || 0) > limit) {
    throw new HttpError(413, 'payloadTooLarge')
  }
  const type = req.headers['content-type'] || ''
  const body = limited(req, limit)
  try {
    if (type.startsWith('application/json')) {
      return { payload: JSON.parse(await new Response(body.stream).text()), uploads: [] }
    }
    if (type.startsWith('multipart/form-data')) {
      const data = await new Request('http://forms.local', {
        method: 'POST',
        headers: { 'content-type': type },
        body: body.stream,
        duplex: 'half'
      } as RequestInit).formData()
      const uploads: Upload[] = []
      for (const [name, value] of data.entries()) {
        if (name.startsWith('file:') && typeof value !== 'string') {
          uploads.push({
            fieldId: name.slice(5),
            name: value.name,
            data: new Uint8Array(await value.arrayBuffer())
          })
        }
      }
      if (uploads.length > 50) {
        throw new HttpError(400, 'invalid')
      }
      return { payload: JSON.parse(String(data.get('payload'))), uploads }
    }
  } catch (e) {
    if (body.exceeded()) {
      throw new HttpError(413, 'payloadTooLarge')
    }
    throw e instanceof HttpError ? e : new HttpError(400, 'malformedBody')
  }
  throw new HttpError(415, 'unsupportedMediaType')
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  })
  res.end(JSON.stringify(body))
}

export function createHandler(config: ServerConfig) {
  const forms = createForms(config)
  const rateLimit = createRateLimiter()
  const maxUpload = (config.maxUploadMb ?? 100) * MB + MB
  const submissionsPer10Min = config.submissionsPer10Min ?? 30

  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url || '/', 'http://forms.local')
      // the OpenCloud proxy may forward the route prefix
      const parts = url.pathname
        .replace(/^\/forms-api(?=\/|$)/, '')
        .split('/')
        .filter(Boolean)
        .map((part) => {
          try {
            return decodeURIComponent(part)
          } catch {
            throw new HttpError(400, 'malformedUrl')
          }
        })
      const route = `${req.method} ${parts.map((p, i) => (i === 2 ? ':id' : p)).join('/')}`
      const header = config.clientIpHeader && req.headers[config.clientIpHeader]
      const client = (typeof header === 'string' && header) || req.socket.remoteAddress || ''
      const bearer = /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1]
      const id = parts[2]

      if (route === 'GET healthz') {
        return send(res, 200, { status: 'ok', uiRevision: 'opencloud-theme-1' })
      }
      if (req.method === 'GET' && parts.length === 2 && parts[0] === 'p') {
        res.writeHead(200, publicPageHeaders)
        return res.end(
          publicPage(
            selectLanguage(req.headers['accept-language'], url.searchParams.get('lang') ?? '')
          )
        )
      }

      switch (route) {
        case 'POST v1/seal': {
          const { payload } = await readBody(req, 64 * 1024)
          return send(res, 200, await forms.sealCredentials(bearer, payload))
        }
        case 'GET v1/public/:id':
          rateLimit(`read:${client}`, 120, 60_000)
          return send(res, 200, await forms.publicForm(id))
        case 'POST v1/public/:id/submissions': {
          rateLimit(`submit:${client}:${id}`, submissionsPer10Min, 600_000)
          const { payload, uploads } = await readBody(req, maxUpload)
          const result = await forms.submitPublic(id, payload, uploads)
          return send(res, result.duplicate ? 200 : 201, result)
        }
        case 'POST v1/forms/:id/submissions': {
          rateLimit(`submit:${client}:${id}`, submissionsPer10Min, 600_000)
          const { payload, uploads } = await readBody(req, maxUpload)
          const result = await forms.submitAuthenticated(bearer, id, payload, uploads)
          return send(res, result.duplicate ? 200 : 201, result)
        }
        case 'POST v1/forms/:id/spreadsheet/sync': {
          const { payload } = await readBody(req, 64 * 1024)
          return send(res, 200, await forms.syncSpreadsheet(bearer, id, payload))
        }
        case 'POST v1/forms/:id/publication/sync': {
          // The public snapshot may contain an embedded background image (maximum 1 MB).
          const { payload } = await readBody(req, 2 * MB)
          return send(res, 200, await forms.syncPublicPublication(bearer, id, payload))
        }
      }
      throw new HttpError(404, 'notFound')
    } catch (e) {
      if (e instanceof HttpError) {
        return send(res, e.status, e.body)
      }
      // never log request bodies or credentials
      console.error(`[forms-server] ${req.method} failed: ${(e as Error)?.message}`)
      send(res, 500, { error: 'internal' })
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = process.env
  if (!env.OPENCLOUD_URL || !env.FORMS_SECRET || env.FORMS_SECRET.length < 32) {
    console.error('OPENCLOUD_URL and FORMS_SECRET (at least 32 characters) are required')
    process.exit(1)
  }
  const server = createServer(
    createHandler({
      opencloudUrl: env.OPENCLOUD_URL,
      secret: env.FORMS_SECRET,
      maxUploadMb: Number(env.FORMS_MAX_UPLOAD_MB) || undefined,
      clientIpHeader: env.FORMS_CLIENT_IP_HEADER?.toLowerCase(),
      submissionsPer10Min: Number(env.FORMS_SUBMISSIONS_PER_10_MIN) || undefined
    })
  )
  const port = Number(env.PORT) || 9280
  server.listen(port, env.HOST || '127.0.0.1', () =>
    console.log(`forms-server listening on ${port}`)
  )
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => server.close(() => process.exit(0)))
  }
}
