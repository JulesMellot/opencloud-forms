import {
  createField,
  createForm,
  fieldsRevision,
  parseForm,
  respondentView,
  serializeForm,
  validateSubmission
} from '../../src/schema'

describe('parseForm', () => {
  it('treats an empty file as a new form', () => {
    expect(parseForm('')).toEqual(createForm())
  })

  it('round-trips a form without changes', () => {
    const form = createForm('Survey')
    form.fields.push(createField('radio', 'Color'), createField('text', 'Name'))
    const content = serializeForm(form)
    expect(serializeForm(parseForm(content))).toBe(content)
  })

  it('rejects files that are not forms', () => {
    expect(() => parseForm('not json')).toThrow()
    expect(() => parseForm('{"title":"x"}')).toThrow()
  })

  it('flags files written by a newer schema version', () => {
    expect(() => parseForm('{"schemaVersion":99}')).toThrow(
      expect.objectContaining({ tooNew: true })
    )
  })

  it('drops malformed fields and coerces settings', () => {
    const form = parseForm(
      JSON.stringify({
        schemaVersion: 1,
        fields: [
          { id: 'fld_1', type: 'nope', label: 'x' },
          { id: 'fld_2', type: 'text', label: 'ok' }
        ],
        settings: { access: 'everyone', acceptingResponses: 'yes', accentColor: 'red' }
      })
    )
    expect(form.fields.map((f) => f.id)).toEqual(['fld_2'])
    expect(form.settings).toMatchObject({
      access: 'authenticated',
      acceptingResponses: false,
      accentColor: ''
    })
  })
})

describe('field identity', () => {
  it('keeps the field id when the label changes', () => {
    const field = createField('text', 'Name')
    const id = field.id
    field.label = 'Full name'
    expect(field.id).toBe(id)
    expect(id).toMatch(/^fld_/)
  })

  it('changes the revision when questions change', () => {
    const fields = [createField('text', 'Name')]
    const before = fieldsRevision(fields)
    expect(fieldsRevision(fields)).toBe(before)
    fields[0].required = true
    expect(fieldsRevision(fields)).not.toBe(before)
  })
})

describe('validateSubmission', () => {
  const text = { ...createField('text', 'Name'), required: true, maxLength: 5 }
  const email = createField('email', 'Email')
  const age = { ...createField('number', 'Age'), min: 18, max: 120 }
  const colors = {
    ...createField('checkbox', 'Colors'),
    options: [
      { id: 'red', label: 'Red' },
      { id: 'blue', label: 'Blue' }
    ],
    maxChoices: 1
  }
  const size = { ...createField('select', 'Size'), options: [{ id: 's', label: 'S' }] }
  const upload = { ...createField('file', 'CV'), required: true, maxSizeMb: 1, maxFiles: 1 }
  const fields = [text, email, age, colors, size, upload]

  it('accepts a valid submission and drops unknown keys', () => {
    const { errors, answers } = validateSubmission(
      fields,
      { [text.id]: ' Ada ', [age.id]: '36', [colors.id]: ['red'], [size.id]: 's', admin: true },
      { [upload.id]: [{ name: 'cv.pdf', size: 1000 }] }
    )
    expect(errors).toEqual({})
    expect(answers).toEqual({
      [text.id]: 'Ada',
      [age.id]: 36,
      [colors.id]: ['red'],
      [size.id]: 's'
    })
  })

  it('reports each rule violation by field id', () => {
    const { errors } = validateSubmission(
      fields,
      {
        [text.id]: 'too long',
        [email.id]: 'not-an-email',
        [age.id]: 12,
        [colors.id]: ['red', 'blue'],
        [size.id]: 'xl'
      },
      { [upload.id]: [{ name: 'big.pdf', size: 2 * 1024 * 1024 }] }
    )
    expect(errors).toEqual({
      [text.id]: 'tooLong',
      [email.id]: 'invalid',
      [age.id]: 'tooSmall',
      [colors.id]: 'tooManyChoices',
      [size.id]: 'invalid',
      [upload.id]: 'fileTooLarge'
    })
  })

  it('requires answers and files for required fields', () => {
    const { errors } = validateSubmission(fields, {})
    expect(errors[text.id]).toBe('required')
    expect(errors[upload.id]).toBe('required')
    expect(errors[email.id]).toBeUndefined()
  })

  it('rejects wrong value types', () => {
    const { errors } = validateSubmission(fields, { [text.id]: ['x'], [colors.id]: 'red' })
    expect(errors[text.id]).toBe('invalid')
    expect(errors[colors.id]).toBe('invalid')
  })
})

describe('respondentView', () => {
  it('exposes no publication data or destinations', () => {
    const form = createForm('Survey')
    const field = { ...createField('file', 'CV'), destinationFolderId: 'secret' }
    form.fields.push(field)
    form.publication = {
      formFileId: 'a',
      responsesFolderId: 'b',
      sealed: 'c',
      publicToken: null,
      spreadsheetFileId: null,
      links: {}
    }
    const view = respondentView(form)
    expect(JSON.stringify(view)).not.toMatch(/secret|"sealed"|responsesFolderId/)
    expect(view.revision).toBe(fieldsRevision(form.fields))
  })
})

describe('malformed input regressions', () => {
  it('rejects unsupported old versions with a format error', () => {
    expect(() => parseForm('{"schemaVersion":0}')).toThrow('Unsupported schema version')
  })

  it('drops unsafe field identifiers and nonnumeric constraints', () => {
    const form = createForm()
    form.fields = ['__proto__', 'constructor', '../file', 'bad"id', 'safe-id'].map((id) => ({
      ...createField('text'),
      id,
      maxLength: '\" autofocus' as unknown as number
    }))
    const parsed = parseForm(serializeForm(form))
    expect(parsed.fields.map((f) => f.id)).toEqual(['safe-id'])
    expect(parsed.fields[0].maxLength).toBeUndefined()
  })

  it('rejects nonexistent dates while accepting leap days', () => {
    const field = createField('date')
    for (const value of ['2025-02-29', '2026-02-31', '2026-04-31']) {
      expect(validateSubmission([field], { [field.id]: value }).errors[field.id]).toBe('invalid')
    }
    expect(validateSubmission([field], { [field.id]: '2024-02-29' }).errors).toEqual({})
  })

  it('does not turn a blank numeric answer into zero', () => {
    const field = { ...createField('number'), required: true }
    expect(validateSubmission([field], { [field.id]: '  ' }).errors[field.id]).toBe('required')
    field.required = false
    expect(validateSubmission([field], { [field.id]: '  ' }).answers).toEqual({})
  })
})
