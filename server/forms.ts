import { translate } from './i18n.ts'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { buildOds, ODS_MIME } from './ods.ts'
import { isAccepted, sanitizeFileName, sniff } from './files.ts'
import {
  answerText,
  fieldsRevision,
  parseForm,
  respondentView,
  SCHEMA_VERSION,
  serializeForm,
  UUID_PATTERN,
  validateSubmission,
  type FileMeta,
  type FormDefinition,
  type FormField,
  type FormResponse,
  type LinkSecret,
  type PrivateCredentials,
  type PublicCredentials,
  type StoredFile
} from '../src/schema.ts'

export interface FormsConfig {
  opencloudUrl: string
  /** Encrypts link credentials; rotating it invalidates every publication */
  secret: string
  fetch?: typeof fetch
  log?: (message: string) => void
  syncDelayMs?: number
}

export interface Upload {
  fieldId: string
  name: string
  data: Uint8Array
}

export interface SubmissionPayload {
  submissionId?: unknown
  revision?: unknown
  answers?: unknown
}

export class HttpError extends Error {
  status: number
  body: Record<string, unknown>

  constructor(status: number, error: string, extra: Record<string, unknown> = {}) {
    super(error)
    this.status = status
    this.body = { error, ...extra }
  }
}

type Auth = { bearer: string } | LinkSecret

interface DavEntry {
  name: string
  fileId: string
  isFolder: boolean
}

const FILE_ID = /^[\w-]+\$[\w-]+![\w-]+$/
const LINK_TOKEN = /^[A-Za-z0-9]{8,64}$/
const PUBLIC_FORM_FILE = '.opencloud-form-public'
const PROPFIND_BODY =
  '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">' +
  '<d:prop><oc:name/><oc:fileid/><oc:permissions/><d:resourcetype/></d:prop></d:propfind>'

export function assertFileId(fileId: unknown): asserts fileId is string {
  if (typeof fileId !== 'string' || !FILE_ID.test(fileId)) {
    throw new HttpError(404, 'notFound')
  }
}

function isSecret(value: unknown): value is LinkSecret {
  const secret = value as LinkSecret
  return (
    !!secret &&
    typeof secret.token === 'string' &&
    LINK_TOKEN.test(secret.token) &&
    typeof secret.password === 'string' &&
    secret.password.length > 0 &&
    secret.password.length < 256
  )
}

function encryptionKey(secret: string) {
  return createHash('sha256').update(secret).digest()
}

export function seal(secret: string, payload: PrivateCredentials | PublicCredentials) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url')
}

/** Any tampering, wrong kind or foreign secret looks like a missing form */
export function unseal<T extends PrivateCredentials | PublicCredentials>(
  secret: string,
  sealed: unknown,
  kind: T['kind']
): T {
  if (typeof sealed === 'string' && sealed.length < 8192) {
    try {
      const raw = Buffer.from(sealed, 'base64url')
      const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), raw.subarray(0, 12))
      decipher.setAuthTag(raw.subarray(12, 28))
      const payload = JSON.parse(
        Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString()
      )
      if (payload.kind === kind) {
        return payload
      }
    } catch {
      // fall through
    }
  }
  throw new HttpError(404, 'notFound')
}

/**
 * Columns follow field ids, labels are only headers: renaming a question relabels its
 * column, deleted questions keep a column while responses hold data for them.
 */
export function responseRows(form: FormDefinition, responses: FormResponse[]) {
  const t = (key: string) => translate(form.settings.spreadsheetLanguage, key)
  const hasData = (field: FormField) =>
    responses.some(
      (r) => r.answers[field.id] !== undefined || r.files.some((f) => f.fieldId === field.id)
    )
  const columns = [...form.fields, ...form.archivedFields.filter(hasData)]
  const withRespondent = responses.some((r) => r.respondent)
  const header = [
    t('Timestamp'),
    t('Submission ID'),
    ...(withRespondent ? [t('Respondent')] : []),
    ...columns.map((f) => f.label || f.id)
  ]
  return [
    header,
    ...responses.map((r) => [
      r.submittedAt,
      r.submissionId,
      ...(withRespondent ? [r.respondent?.displayName ?? ''] : []),
      ...columns.map((f) => answerText(f, r, [t('Yes'), t('No')]))
    ])
  ]
}

function parseMultistatus(xml: string): DavEntry[] {
  return xml
    .split(/<[a-z]*:?response>/i)
    .slice(1)
    .map((block) => ({
      name: decodeXml(/<oc:name>([^<]*)</.exec(block)?.[1] ?? ''),
      fileId: /<oc:fileid>([^<]*)</.exec(block)?.[1] ?? '',
      isFolder: /<[a-z]*:?collection\s*\/>/i.test(block),
      permissions: /<oc:permissions>([^<]*)</.exec(block)?.[1] ?? ''
    }))
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

export function createForms(config: FormsConfig) {
  const doFetch = config.fetch ?? fetch
  const baseUrl = config.opencloudUrl.replace(/\/+$/, '')
  const log = config.log ?? ((message: string) => console.error(`[forms-server] ${message}`))
  const syncDelayMs = config.syncDelayMs ?? 5000

  function request(
    method: string,
    path: string,
    auth: Auth,
    init: { body?: BodyInit; headers?: Record<string, string> } = {}
  ) {
    const authorization =
      'bearer' in auth
        ? `Bearer ${auth.bearer}`
        : `Basic ${Buffer.from(`public:${auth.password}`).toString('base64')}`
    return doFetch(baseUrl + path, {
      method,
      body: init.body,
      headers: { Authorization: authorization, ...init.headers },
      // credentials must never follow a redirect to another host
      redirect: 'manual',
      signal: AbortSignal.timeout(60_000)
    })
  }

  function linkPath(link: LinkSecret, name = '') {
    return `/dav/public-files/${link.token}/${name.split('/').map(encodeURIComponent).join('/')}`
  }

  function storageError(response: Response) {
    if (response.status === 507) {
      return new HttpError(507, 'quotaExceeded')
    }
    // revoked link, deleted folder, lost permission
    return new HttpError(503, 'storageUnavailable')
  }

  async function propfind(path: string, auth: Auth, depth: 0 | 1) {
    const response = await request('PROPFIND', path, auth, {
      body: PROPFIND_BODY,
      headers: { Depth: String(depth), 'Content-Type': 'application/xml' }
    })
    if (response.status !== 207) {
      throw storageError(response)
    }
    return parseMultistatus(await response.text())
  }

  async function authenticate(bearer: string | undefined) {
    if (!bearer) {
      throw new HttpError(401, 'unauthenticated')
    }
    const response = await request('GET', '/graph/v1.0/me', { bearer })
    if (response.status === 401) {
      throw new HttpError(401, 'unauthenticated')
    }
    if (!response.ok) {
      throw new HttpError(502, 'openCloudUnavailable')
    }
    const user = (await response.json()) as { id?: string; displayName?: string }
    return { id: String(user.id ?? ''), displayName: String(user.displayName ?? '') }
  }

  async function canEdit(bearer: string, fileId: string) {
    try {
      const [entry] = (await propfind(`/dav/spaces/${fileId}`, { bearer }, 0)) as (DavEntry & {
        permissions: string
      })[]
      return !!entry && entry.permissions.includes('W')
    } catch {
      return false
    }
  }

  async function readUserForm(bearer: string, fileId: string) {
    const response = await request('GET', `/dav/spaces/${fileId}`, { bearer })
    if (response.status === 401) {
      throw new HttpError(401, 'unauthenticated')
    }
    if (!response.ok) {
      throw new HttpError(404, 'notFound')
    }
    return parseStoredForm(await response.text())
  }

  function parseStoredForm(content: string) {
    try {
      return parseForm(content)
    } catch {
      throw new HttpError(404, 'notFound')
    }
  }

  async function loadPublicForm(token: unknown) {
    const credentials = unseal<PublicCredentials>(config.secret, token, 'public')
    let form: FormDefinition
    try {
      if (!isSecret(credentials.responses)) {
        throw new Error()
      }
      const response = await request(
        'GET',
        linkPath(credentials.responses, PUBLIC_FORM_FILE),
        credentials.responses
      )
      if (!response.ok) {
        throw new Error()
      }
      form = parseStoredForm(await response.text())
    } catch {
      throw new HttpError(404, 'notFound')
    }
    if (
      form.publication?.formFileId !== credentials.formFileId ||
      form.settings.access !== 'public'
    ) {
      throw new HttpError(404, 'notFound')
    }
    return { form, fileId: credentials.formFileId }
  }

  async function syncPublicPublication(bearer: string | undefined, fileId: unknown, body: any) {
    await authenticate(bearer)
    assertFileId(fileId)
    if (!(await canEdit(bearer, fileId))) {
      throw new HttpError(403, 'forbidden')
    }

    let form: FormDefinition
    try {
      form = parseForm(JSON.stringify(body?.form))
    } catch {
      throw new HttpError(400, 'invalid')
    }
    if (form.publication?.formFileId !== fileId) {
      throw new HttpError(400, 'invalid')
    }
    const privateCredentials = unseal<PrivateCredentials>(
      config.secret,
      body?.sealed ?? form.publication.sealed,
      'private'
    )
    if (privateCredentials.formFileId !== fileId || !isSecret(privateCredentials.responses)) {
      throw new HttpError(400, 'invalidCredentials')
    }

    const written = await request(
      'PUT',
      linkPath(privateCredentials.responses, PUBLIC_FORM_FILE),
      privateCredentials.responses,
      {
        body: serializeForm(form),
        headers: { 'Content-Type': 'application/json' }
      }
    )
    if (!written.ok) {
      throw storageError(written)
    }

    let publicToken = body?.publicToken
    try {
      const existing = unseal<PublicCredentials>(config.secret, publicToken, 'public')
      if (
        existing.formFileId !== fileId ||
        existing.responses.token !== privateCredentials.responses.token ||
        existing.responses.password !== privateCredentials.responses.password
      ) {
        publicToken = undefined
      }
    } catch {
      publicToken = undefined
    }
    return {
      publicToken:
        publicToken ||
        seal(config.secret, {
          kind: 'public',
          formFileId: fileId,
          responses: privateCredentials.responses
        })
    }
  }

  async function sealCredentials(bearer: string | undefined, body: any) {
    await authenticate(bearer)
    const formFileId = body?.formFileId
    assertFileId(formFileId)
    if (!(await canEdit(bearer, formFileId))) {
      throw new HttpError(403, 'forbidden')
    }

    let payload: PrivateCredentials | PublicCredentials
    if (body.base) {
      const current = unseal<PrivateCredentials>(config.secret, body.base, 'private')
      const destinations = { ...current.destinations }
      for (const [fieldId, secret] of Object.entries(body.patch?.destinations ?? {})) {
        if (secret === null) {
          delete destinations[fieldId]
        } else {
          destinations[fieldId] = secret as LinkSecret
        }
      }
      payload = {
        ...current,
        destinations,
        sheet: body.patch?.sheet === undefined ? current.sheet : body.patch.sheet
      }
    } else {
      payload = body.credentials
    }

    if (payload?.formFileId !== formFileId) {
      throw new HttpError(400, 'invalidCredentials')
    }
    const secrets =
      payload.kind === 'public'
        ? [payload.responses]
        : payload.kind === 'private'
          ? [payload.responses, ...Object.values(payload.destinations ?? {}), payload.sheet].filter(
              (s) => s !== null
            )
          : [null]
    if (!secrets.every(isSecret)) {
      throw new HttpError(400, 'invalidCredentials')
    }
    for (const secret of secrets) {
      await propfind(linkPath(secret), secret, 0).catch(() => {
        throw new HttpError(400, 'invalidLink')
      })
    }
    return { sealed: seal(config.secret, payload) }
  }

  async function submit(
    form: FormDefinition,
    fileId: string,
    payload: SubmissionPayload,
    uploads: Upload[],
    respondent: FormResponse['respondent']
  ) {
    if (form.publication?.formFileId !== fileId) {
      throw new HttpError(404, 'notFound')
    }
    if (!form.settings.acceptingResponses) {
      throw new HttpError(403, 'closed')
    }
    if (payload?.revision !== fieldsRevision(form.fields)) {
      throw new HttpError(409, 'formChanged')
    }
    const submissionId = payload.submissionId
    if (typeof submissionId !== 'string' || !UUID_PATTERN.test(submissionId)) {
      throw new HttpError(400, 'invalidSubmissionId')
    }

    const fieldsById = new Map(form.fields.map((f) => [f.id, f]))
    const fileMeta: Record<string, FileMeta[]> = {}
    for (const upload of uploads) {
      if (fieldsById.get(upload.fieldId)?.type !== 'file') {
        throw new HttpError(400, 'invalid')
      }
      ;(fileMeta[upload.fieldId] ??= []).push({ name: upload.name, size: upload.data.length })
    }
    const { errors, answers } = validateSubmission(form.fields, payload.answers, fileMeta)
    const sniffed = uploads.map((upload) => sniff(upload.data, upload.name))
    uploads.forEach((upload, i) => {
      if (
        !errors[upload.fieldId] &&
        !isAccepted(sniffed[i], fieldsById.get(upload.fieldId).accept)
      ) {
        errors[upload.fieldId] = 'fileType'
      }
    })
    if (Object.keys(errors).length) {
      throw new HttpError(400, 'invalid', { fields: errors })
    }

    const credentials = unseal<PrivateCredentials>(
      config.secret,
      form.publication.sealed,
      'private'
    )
    if (credentials.formFileId !== fileId) {
      throw new HttpError(404, 'notFound')
    }
    const responses = credentials.responses
    const responseName = `${submissionId}.json`

    // The upload link ignores If-None-Match, so a replayed submission is detected by name.
    // Two concurrent replays write identical content, which still leaves a single response.
    const existing = await request('HEAD', linkPath(responses, responseName), responses)
    if (existing.ok) {
      return { submissionId, duplicate: true }
    }

    if (existing.status !== 404) {
      throw storageError(existing)
    }

    const files: StoredFile[] = []
    const counters: Record<string, number> = {}
    let filesFolderReady = false
    for (const [i, upload] of uploads.entries()) {
      const field = fieldsById.get(upload.fieldId)
      const destination = field.destinationFolderId ? credentials.destinations[field.id] : undefined
      if (field.destinationFolderId && !destination) {
        throw new HttpError(503, 'storageUnavailable')
      }
      const index = (counters[field.id] = (counters[field.id] ?? 0) + 1)
      const storedName = `${submissionId}-${field.id}-${index}.${sniffed[i].ext}`
      if (!destination && !filesFolderReady) {
        const created = await request('MKCOL', linkPath(responses, 'files'), responses)
        if (!created.ok && created.status !== 405) {
          throw storageError(created)
        }
        filesFolderReady = true
      }
      const target = destination ?? responses
      const path = destination ? storedName : `files/${storedName}`
      const response = await request('PUT', linkPath(target, path), target, {
        body: upload.data as BodyInit,
        headers: { 'Content-Type': 'application/octet-stream' }
      })
      if (!response.ok) {
        // files already stored stay in place, they are named after the submission id
        throw storageError(response)
      }
      files.push({
        fieldId: field.id,
        name: sanitizeFileName(upload.name),
        storedName: path,
        size: upload.data.length,
        mime: sniffed[i].mime,
        fileId: response.headers.get('oc-fileid') ?? ''
      })
    }

    const record: FormResponse = {
      schemaVersion: SCHEMA_VERSION,
      submissionId,
      formFileId: fileId,
      formRevision: fieldsRevision(form.fields),
      submittedAt: new Date().toISOString(),
      respondent,
      answers,
      files
    }
    const stored = await request('PUT', linkPath(responses, responseName), responses, {
      body: JSON.stringify(record, null, 2),
      headers: { 'Content-Type': 'application/json' }
    })
    if (!stored.ok) {
      throw storageError(stored)
    }

    // the response is stored: the spreadsheet is a derived view and may lag behind
    if (credentials.sheet) {
      scheduleSync(fileId, form, credentials)
    }
    return { submissionId, duplicate: false }
  }

  async function regenerateSpreadsheet(form: FormDefinition, credentials: PrivateCredentials) {
    const { responses, sheet } = credentials
    if (!sheet) {
      throw new HttpError(409, 'noSpreadsheet')
    }
    const entries = (await propfind(linkPath(responses), responses, 1)).filter(
      (e) => !e.isFolder && e.name.endsWith('.json')
    )
    // ponytail: rereads every response on each sync, O(n); keep an incremental row cache
    // if forms reach tens of thousands of responses
    const records: FormResponse[] = []
    for (let i = 0; i < entries.length; i += 8) {
      const batch = await Promise.all(
        entries.slice(i, i + 8).map(async ({ name }) => {
          const response = await request('GET', linkPath(responses, name), responses)
          try {
            return response.ok ? ((await response.json()) as FormResponse) : null
          } catch {
            return null
          }
        })
      )
      records.push(
        ...batch.filter((r) => r && typeof r.submittedAt === 'string' && r.answers && r.files)
      )
    }
    records.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))

    const target = (await propfind(linkPath(sheet), sheet, 1)).find((e) => !e.isFolder && e.name)
    if (!target) {
      throw new HttpError(404, 'spreadsheetMissing')
    }
    const written = await request('PUT', linkPath(sheet, target.name), sheet, {
      body: buildOds(responseRows(form, records)) as BodyInit,
      headers: { 'Content-Type': ODS_MIME }
    })
    if (!written.ok) {
      throw storageError(written)
    }
    return { rows: records.length }
  }

  const syncs = new Map<string, { timer?: ReturnType<typeof setTimeout>; running?: boolean }>()

  function scheduleSync(
    fileId: string,
    form: FormDefinition,
    credentials: PrivateCredentials,
    attempt = 0
  ) {
    const state = syncs.get(fileId) ?? {}
    clearTimeout(state.timer)
    const delay = attempt ? Math.min(30_000 * 3 ** (attempt - 1), 3_600_000) : syncDelayMs
    state.timer = setTimeout(async () => {
      if (state.running) {
        // one write at a time per spreadsheet, so an older projection never lands last
        return scheduleSync(fileId, form, credentials, attempt)
      }
      state.running = true
      try {
        await regenerateSpreadsheet(form, credentials)
        syncs.delete(fileId)
      } catch (e) {
        log(`spreadsheet sync failed, attempt ${attempt + 1}: ${(e as Error).message}`)
        if (attempt < 5) {
          scheduleSync(fileId, form, credentials, attempt + 1)
        }
      } finally {
        state.running = false
      }
    }, delay)
    state.timer.unref?.()
    syncs.set(fileId, state)
  }

  return {
    sealCredentials,
    syncPublicPublication,

    async publicForm(token: unknown) {
      const { form } = await loadPublicForm(token)
      return respondentView(form)
    },

    async submitPublic(token: unknown, payload: SubmissionPayload, uploads: Upload[]) {
      const { form, fileId } = await loadPublicForm(token)
      return submit(form, fileId, payload, uploads, null)
    },

    async submitAuthenticated(
      bearer: string | undefined,
      fileId: unknown,
      payload: SubmissionPayload,
      uploads: Upload[]
    ) {
      const user = await authenticate(bearer)
      assertFileId(fileId)
      // reading the form with the respondent's token is the authorization: OpenCloud shares decide
      const form = await readUserForm(bearer, fileId)
      return submit(form, fileId, payload, uploads, form.settings.collectIdentity ? user : null)
    },

    async syncSpreadsheet(bearer: string | undefined, fileId: unknown, body: any) {
      await authenticate(bearer)
      assertFileId(fileId)
      if (!(await canEdit(bearer, fileId))) {
        throw new HttpError(403, 'forbidden')
      }
      const form = await readUserForm(bearer, fileId)
      const credentials = unseal<PrivateCredentials>(
        config.secret,
        body?.sealed ?? form.publication?.sealed,
        'private'
      )
      if (credentials.formFileId !== fileId) {
        throw new HttpError(404, 'notFound')
      }
      return regenerateSpreadsheet(form, credentials)
    }
  }
}
