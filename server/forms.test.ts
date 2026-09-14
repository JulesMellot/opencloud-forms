import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createForms, HttpError, seal, unseal } from './forms.ts'
import {
  createField,
  createForm,
  fieldsRevision,
  serializeForm,
  type FormDefinition,
  type PrivateCredentials,
  type PublicCredentials
} from '../src/schema.ts'

const SECRET = 'test-secret-with-at-least-32-characters'
const FORM_ID = 'storage-1$space-1!form-1'
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const EXE = Uint8Array.from([0x4d, 0x5a, 0x90, 0x00])
const LINKS: Record<string, { password: string; file?: string }> = {
  responsesToken: { password: 'pw-responses' },
  viewToken1: { password: 'pw-view', file: 'Survey.ocform' },
  sheetToken1: { password: 'pw-sheet', file: 'Survey.ods' }
}
const USERS: Record<string, { id: string; displayName: string; permissions: string }> = {
  editor: { id: 'u1', displayName: 'Alice', permissions: 'RDNVW' },
  viewer: { id: 'u2', displayName: 'Bob', permissions: 'R' }
}

/** In-memory stand-in for the OpenCloud endpoints forms-server talks to */
function fakeOpenCloud() {
  const stored = new Map<string, Uint8Array>()
  let formContent = ''

  const multistatus = (entries: { name: string; folder?: boolean; permissions?: string }[]) =>
    new Response(
      '<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">' +
        entries
          .map(
            (e) =>
              `<d:response><d:propstat><d:prop><oc:name>${e.name}</oc:name>` +
              `<oc:permissions>${e.permissions ?? ''}</oc:permissions>` +
              `<d:resourcetype>${e.folder ? '<d:collection/>' : ''}</d:resourcetype>` +
              '</d:prop></d:propstat></d:response>'
          )
          .join('') +
        '</d:multistatus>',
      { status: 207 }
    )

  const fetchImpl = async (input: string, init: RequestInit) => {
    const url = new URL(input)
    const method = init.method
    const authorization = (init.headers as Record<string, string>).Authorization
    const user = USERS[authorization.replace('Bearer ', '')]
    const body = async () => new Uint8Array(await new Response(init.body).arrayBuffer())

    if (url.pathname === '/graph/v1.0/me') {
      return user ? Response.json(user) : new Response(null, { status: 401 })
    }
    if (url.pathname.startsWith('/dav/spaces/')) {
      if (!user) {
        return new Response(null, { status: 401 })
      }
      if (url.pathname !== `/dav/spaces/${FORM_ID}`) {
        return new Response(null, { status: 404 })
      }
      return method === 'PROPFIND'
        ? multistatus([{ name: 'Survey.ocform', permissions: user.permissions }])
        : new Response(formContent)
    }

    const match = /^\/dav\/public-files\/([^/]+)\/?(.*)$/.exec(url.pathname)
    const link = match && LINKS[match[1]]
    const expected = link && `Basic ${Buffer.from(`public:${link.password}`).toString('base64')}`
    if (!link || authorization !== expected) {
      return new Response(null, { status: 401 })
    }
    const path = decodeURIComponent(match[2])
    if (method === 'PROPFIND') {
      const children = link.file
        ? [{ name: link.file }]
        : [...stored.keys()]
            .filter((key) => key.startsWith('responses/') && !key.slice(10).includes('/'))
            .map((key) => ({ name: key.slice(10) }))
      return multistatus([{ name: '', folder: true }, ...children])
    }
    if (link.file) {
      if (match[1] === 'viewToken1' && method === 'GET' && path === link.file) {
        return new Response(formContent)
      }
      if (match[1] === 'sheetToken1' && method === 'PUT' && path === link.file) {
        stored.set('sheet', await body())
        return new Response(null, { status: 204 })
      }
      return new Response(null, { status: 403 })
    }
    const key = `responses/${path}`
    switch (method) {
      case 'HEAD':
      case 'GET':
        return stored.has(key)
          ? new Response(method === 'GET' ? (stored.get(key) as BodyInit) : null)
          : new Response(null, { status: 404 })
      case 'MKCOL':
        return new Response(null, { status: 201 })
      case 'PUT':
        stored.set(key, await body())
        return new Response(null, {
          status: 201,
          headers: { 'oc-fileid': `storage-1$space-1!${path}` }
        })
    }
    return new Response(null, { status: 405 })
  }

  return {
    stored,
    fetch: fetchImpl as unknown as typeof fetch,
    setForm: (form: FormDefinition) => {
      formContent = serializeForm(form)
      stored.set('responses/.opencloud-form-public', new TextEncoder().encode(formContent))
    },
    json: (key: string) => JSON.parse(new TextDecoder().decode(stored.get(key)))
  }
}

function setup({ access = 'public' as 'public' | 'authenticated', sheet = false } = {}) {
  const openCloud = fakeOpenCloud()
  const form = createForm('Survey')
  const name = createField('text', 'Name')
  name.required = true
  const photo = createField('file', 'Photo')
  photo.accept = ['image']
  form.fields = [name, photo]
  form.settings.acceptingResponses = true
  form.settings.access = access
  form.publication = {
    formFileId: FORM_ID,
    responsesFolderId: 'storage-1$space-1!responses',
    sealed: seal(SECRET, {
      kind: 'private',
      formFileId: FORM_ID,
      responses: { token: 'responsesToken', password: 'pw-responses' },
      destinations: {},
      sheet: sheet ? { token: 'sheetToken1', password: 'pw-sheet' } : null
    }),
    publicToken: null,
    spreadsheetFileId: null,
    links: {}
  }
  openCloud.setForm(form)
  const publicToken = seal(SECRET, {
    kind: 'public',
    formFileId: FORM_ID,
    responses: { token: 'responsesToken', password: 'pw-responses' }
  })
  const forms = createForms({
    opencloudUrl: 'https://cloud.test',
    secret: SECRET,
    fetch: openCloud.fetch,
    log: () => {},
    syncDelayMs: 60_000
  })
  const payload = (answers: Record<string, unknown> = { [name.id]: ' Ada ' }) => ({
    submissionId: crypto.randomUUID(),
    revision: fieldsRevision(form.fields),
    answers
  })
  return { openCloud, form, name, photo, forms, publicToken, payload }
}

const httpError = (status: number, check: (e: HttpError) => boolean = () => true) => {
  return (e: unknown) => e instanceof HttpError && e.status === status && check(e)
}

test('stores a valid public submission with its sniffed upload', async () => {
  const { forms, publicToken, payload, photo, openCloud } = setup()
  const submission = payload()
  const result = await forms.submitPublic(publicToken, submission, [
    { fieldId: photo.id, name: '../me.png', data: PNG }
  ])
  assert.deepEqual(result, { submissionId: submission.submissionId, duplicate: false })

  const response = openCloud.json(`responses/${submission.submissionId}.json`)
  assert.equal(Object.values(response.answers)[0], 'Ada')
  assert.equal(response.respondent, null)
  assert.equal(response.files[0].name, 'me.png')
  assert.equal(response.files[0].mime, 'image/png')
  assert.equal(response.files[0].storedName, `files/${submission.submissionId}-${photo.id}-1.png`)
})

test('a retried submission does not create a second response', async () => {
  const { forms, publicToken, payload, openCloud } = setup()
  const submission = payload()
  await forms.submitPublic(publicToken, submission, [])
  const retry = await forms.submitPublic(publicToken, submission, [])
  assert.equal(retry.duplicate, true)
  assert.equal([...openCloud.stored.keys()].filter((k) => k.endsWith('.json')).length, 1)
})

test('rejects an executable renamed to .jpg and stores nothing', async () => {
  const { forms, publicToken, payload, photo, openCloud } = setup()
  await assert.rejects(
    forms.submitPublic(publicToken, payload(), [
      { fieldId: photo.id, name: 'malware.jpg', data: EXE }
    ]),
    httpError(400, (e) => (e.body.fields as Record<string, string>)[photo.id] === 'fileType')
  )
  assert.equal([...openCloud.stored.keys()].filter((key) => key.endsWith('.json')).length, 0)
})

test('enforces required fields on the server', async () => {
  const { forms, publicToken, payload, name } = setup()
  await assert.rejects(
    forms.submitPublic(publicToken, payload({}), []),
    httpError(400, (e) => (e.body.fields as Record<string, string>)[name.id] === 'required')
  )
})

test('refuses submissions when the form is closed, changed or unknown', async () => {
  const { forms, publicToken, payload, form, openCloud } = setup()
  await assert.rejects(
    forms.submitPublic(publicToken, { ...payload(), revision: 'stale' }, []),
    httpError(409)
  )
  await assert.rejects(forms.submitPublic('forged', payload(), []), httpError(404))
  await assert.rejects(forms.submitPublic(form.publication.sealed, payload(), []), httpError(404))

  form.settings.acceptingResponses = false
  openCloud.setForm(form)
  await assert.rejects(forms.submitPublic(publicToken, payload(), []), httpError(403))
})

test('the public view hides publication data and upload destinations', async () => {
  const { forms, publicToken, form, photo, openCloud } = setup()
  photo.destinationFolderId = 'storage-1$space-1!secret-folder'
  openCloud.setForm(form)
  const view = await forms.publicForm(publicToken)
  assert.equal(JSON.stringify(view).includes('secret-folder'), false)
  assert.equal(JSON.stringify(view).includes('responsesToken'), false)
  assert.equal('publication' in view, false)
})

test('an authenticated-only form is not reachable through a public token', async () => {
  const { forms, publicToken } = setup({ access: 'authenticated' })
  await assert.rejects(forms.publicForm(publicToken), httpError(404))
})

test('authenticated submissions require a valid token and record the respondent', async () => {
  const { forms, payload, openCloud } = setup({ access: 'authenticated' })
  await assert.rejects(forms.submitAuthenticated('nope', FORM_ID, payload(), []), httpError(401))
  await assert.rejects(forms.submitAuthenticated(undefined, FORM_ID, payload(), []), httpError(401))

  const submission = payload()
  await forms.submitAuthenticated('viewer', FORM_ID, submission, [])
  assert.deepEqual(openCloud.json(`responses/${submission.submissionId}.json`).respondent, {
    id: 'u2',
    displayName: 'Bob'
  })
})

test('a copied form cannot write into the original responses folder', async () => {
  const { forms, payload, form, openCloud } = setup({ access: 'authenticated' })
  form.publication.formFileId = 'storage-1$space-1!original'
  openCloud.setForm(form)
  await assert.rejects(forms.submitAuthenticated('editor', FORM_ID, payload(), []), httpError(404))
})

test('only editors of the form can seal credentials', async () => {
  const { forms } = setup()
  const credentials: PrivateCredentials = {
    kind: 'private',
    formFileId: FORM_ID,
    responses: { token: 'responsesToken', password: 'pw-responses' },
    destinations: {},
    sheet: null
  }
  await assert.rejects(
    forms.sealCredentials('viewer', { formFileId: FORM_ID, credentials }),
    httpError(403)
  )
  const { sealed } = await forms.sealCredentials('editor', { formFileId: FORM_ID, credentials })
  assert.deepEqual(unseal(SECRET, sealed, 'private'), credentials)

  await assert.rejects(
    forms.sealCredentials('editor', {
      formFileId: FORM_ID,
      credentials: { ...credentials, responses: { token: 'responsesToken', password: 'wrong' } }
    }),
    httpError(400)
  )
})

test('publishes a stable standalone token and revokes it through the stored snapshot', async () => {
  const { forms, form, openCloud } = setup()
  openCloud.stored.delete('responses/.opencloud-form-public')

  await assert.rejects(
    forms.syncPublicPublication('viewer', FORM_ID, { form, sealed: form.publication.sealed }),
    httpError(403)
  )
  const created = await forms.syncPublicPublication('editor', FORM_ID, {
    form,
    sealed: form.publication.sealed
  })
  assert.equal(
    unseal<PublicCredentials>(SECRET, created.publicToken, 'public').responses.token,
    'responsesToken'
  )

  form.title = 'Updated survey'
  const updated = await forms.syncPublicPublication('editor', FORM_ID, {
    form,
    sealed: form.publication.sealed,
    publicToken: created.publicToken
  })
  assert.equal(updated.publicToken, created.publicToken)
  assert.equal((await forms.publicForm(created.publicToken)).title, 'Updated survey')

  form.settings.access = 'authenticated'
  await forms.syncPublicPublication('editor', FORM_ID, {
    form,
    sealed: form.publication.sealed,
    publicToken: created.publicToken
  })
  await assert.rejects(forms.publicForm(created.publicToken), httpError(404))
})

test('regenerates the spreadsheet from stored responses', async () => {
  const { forms, publicToken, payload, openCloud } = setup({ sheet: true })
  await forms.submitPublic(publicToken, payload(), [])
  assert.deepEqual(await forms.syncSpreadsheet('editor', FORM_ID, {}), { rows: 1 })
  const sheet = Buffer.from(openCloud.stored.get('sheet'))
  assert.equal(sheet.toString('utf8', 0, 2), 'PK')
  assert.match(sheet.toString('utf8'), /<text:p>Name<\/text:p>.*<text:p>Ada<\/text:p>/)
  await assert.rejects(forms.syncSpreadsheet('viewer', FORM_ID, {}), httpError(403))
})

for (const method of ['HEAD', 'MKCOL']) {
  test(`stops a submission when storage ${method} fails`, async () => {
    const { openCloud, publicToken, payload, photo } = setup()
    const forms = createForms({
      opencloudUrl: 'https://cloud.test',
      secret: SECRET,
      fetch: ((input, init) =>
        init?.method === method
          ? Promise.resolve(new Response(null, { status: 507 }))
          : openCloud.fetch(input, init)) as typeof fetch
    })
    await assert.rejects(
      forms.submitPublic(publicToken, payload(), [
        { fieldId: photo.id, name: 'photo.png', data: PNG }
      ]),
      httpError(507)
    )
    assert.equal(
      [...openCloud.stored.keys()].some((key) => key.endsWith('.json')),
      false
    )
  })
}

test('does not silently redirect uploads when destination credentials are missing', async () => {
  const { forms, publicToken, payload, photo, form, openCloud } = setup()
  photo.destinationFolderId = 'storage-1$space-1!destination'
  openCloud.setForm(form)
  await assert.rejects(
    forms.submitPublic(publicToken, payload(), [
      { fieldId: photo.id, name: 'photo.png', data: PNG }
    ]),
    httpError(503)
  )
  assert.equal(
    [...openCloud.stored.keys()].some((key) => key.startsWith('responses/files/')),
    false
  )
})
