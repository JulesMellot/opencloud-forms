/**
 * The .ocform file format and submission validation, shared by the web extension
 * and forms-server. The server runs this file through Node's type stripping, so it
 * must stay free of imports and of non-erasable TypeScript syntax (enums, namespaces…).
 */

export const SCHEMA_VERSION = 1
export const FILE_EXTENSION = 'ocform'

export const fieldTypes = [
  'text',
  'textarea',
  'number',
  'email',
  'url',
  'radio',
  'checkbox',
  'select',
  'boolean',
  'date',
  'time',
  'file'
] as const
export type FieldType = (typeof fieldTypes)[number]

export const fileCategories = [
  'image',
  'video',
  'audio',
  'pdf',
  'document',
  'archive',
  'any'
] as const
export type FileCategory = (typeof fileCategories)[number]

export interface FieldOption {
  id: string
  label: string
}

export interface FormField {
  /** Stable technical id, never derived from the label */
  id: string
  type: FieldType
  label: string
  description: string
  required: boolean
  placeholder?: string
  options?: FieldOption[]
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  maxChoices?: number
  accept?: FileCategory[]
  maxSizeMb?: number
  maxFiles?: number
  /** Upload destination; when unset, files go to the responses folder */
  destinationFolderId?: string
}

export type FormLanguage = 'fr' | 'es' | 'de' | 'en'

export interface FormSettings {
  spreadsheetLanguage: FormLanguage
  acceptingResponses: boolean
  access: 'authenticated' | 'public'
  collectIdentity: boolean
  confirmationMessage: string
  submitLabel: string
  accentColor: string
  backgroundColor: string
  /** Embedded raster image so a public form never depends on a third-party host. */
  backgroundImage: string
}

export interface LinkRef {
  itemId: string
  permissionId: string
}

export interface Publication {
  /** fileId of the form this publication was created for, copies of the file get a new one */
  formFileId: string
  responsesFolderId: string
  /** PrivateCredentials encrypted by forms-server, unreadable without the server secret */
  sealed: string
  /** PublicCredentials encrypted by forms-server, used as public URL token */
  publicToken: string | null
  spreadsheetFileId: string | null
  /** OpenCloud link shares created for this publication, keyed by purpose */
  links: Record<string, LinkRef>
}

export interface FormDefinition {
  schemaVersion: number
  title: string
  description: string
  fields: FormField[]
  /** Deleted fields, kept so historical responses stay readable */
  archivedFields: FormField[]
  settings: FormSettings
  publication: Publication | null
}

export interface LinkSecret {
  token: string
  password: string
}

export interface PrivateCredentials {
  kind: 'private'
  formFileId: string
  responses: LinkSecret
  destinations: Record<string, LinkSecret>
  sheet: LinkSecret | null
}

export interface PublicCredentials {
  kind: 'public'
  formFileId: string
  /** Server-only access to the publication snapshot stored with the responses. */
  responses: LinkSecret
}

export type AnswerValue = string | string[] | number | boolean
export type Answers = Record<string, AnswerValue>

export interface FileMeta {
  name: string
  size: number
}

export interface StoredFile {
  fieldId: string
  name: string
  storedName: string
  size: number
  mime: string
  fileId: string
}

export interface FormResponse {
  schemaVersion: number
  submissionId: string
  formFileId: string
  formRevision: string
  submittedAt: string
  respondent: { id: string; displayName: string } | null
  answers: Answers
  files: StoredFile[]
}

export interface RespondentForm {
  title: string
  description: string
  fields: FormField[]
  settings: Pick<
    FormSettings,
    | 'acceptingResponses'
    | 'confirmationMessage'
    | 'submitLabel'
    | 'accentColor'
    | 'backgroundColor'
    | 'backgroundImage'
  >
  revision: string
}

export type ValidationError =
  | 'required'
  | 'invalid'
  | 'tooShort'
  | 'tooLong'
  | 'tooSmall'
  | 'tooLarge'
  | 'tooManyChoices'
  | 'fileType'
  | 'fileTooLarge'
  | 'tooManyFiles'

/** Hard caps applied even when the owner sets no limit, against oversized payloads */
const TEXT_LIMITS: Record<string, number> = {
  text: 1000,
  textarea: 20000,
  email: 320,
  url: 2048,
  date: 10,
  time: 5
}
const MAX_OPTIONS = 200
export const DEFAULT_MAX_SIZE_MB = 10
export const MAX_FILES_PER_FIELD = 10
export const MAX_BACKGROUND_IMAGE_BYTES = 1024 * 1024
const MAX_BACKGROUND_DATA_URL_LENGTH = Math.ceil((MAX_BACKGROUND_IMAGE_BYTES * 4) / 3) + 128
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const acceptAttribute: Record<FileCategory, string> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
  pdf: 'application/pdf,.pdf',
  document: '.doc,.docx,.odt,.xls,.xlsx,.ods,.ppt,.pptx,.odp,.txt,.csv,.md,.rtf',
  archive: '.zip,.7z,.gz',
  any: ''
}

export class FormFormatError extends Error {
  tooNew: boolean

  constructor(message: string, tooNew = false) {
    super(message)
    this.tooNew = tooNew
  }
}

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`
}

export function isChoiceType(type: FieldType) {
  return type === 'radio' || type === 'checkbox' || type === 'select'
}

export function createForm(title = ''): FormDefinition {
  return {
    schemaVersion: SCHEMA_VERSION,
    title,
    description: '',
    fields: [],
    archivedFields: [],
    settings: {
      spreadsheetLanguage: 'fr',
      acceptingResponses: false,
      access: 'authenticated',
      collectIdentity: true,
      confirmationMessage: '',
      submitLabel: '',
      accentColor: '',
      backgroundColor: '',
      backgroundImage: ''
    },
    publication: null
  }
}

export function createField(type: FieldType, label = ''): FormField {
  const field: FormField = { id: newId('fld'), type, label, description: '', required: false }
  if (isChoiceType(type)) {
    field.options = [{ id: newId('opt'), label: '' }]
  }
  if (type === 'file') {
    field.accept = ['any']
    field.maxSizeMb = DEFAULT_MAX_SIZE_MB
    field.maxFiles = 1
  }
  return field
}

/** Upgrades form data of version n to n + 1, one entry per past version */
const migrations: Record<number, (data: any) => any> = {}

function isObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isField(value: unknown): value is FormField {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    /^[A-Za-z0-9_-]+$/.test(value.id) &&
    !['__proto__', 'constructor', 'prototype'].includes(value.id) &&
    typeof value.label === 'string' &&
    fieldTypes.includes(value.type)
  )
}

function normalizeField(field: FormField): FormField {
  return {
    ...field,
    description: asString(field.description),
    required: field.required === true,
    placeholder: typeof field.placeholder === 'string' ? field.placeholder : undefined,
    ...Object.fromEntries(
      ['minLength', 'maxLength', 'min', 'max', 'maxChoices', 'maxSizeMb', 'maxFiles'].map((key) => [
        key,
        asNumber(field[key as keyof FormField])
      ])
    ),
    options: Array.isArray(field.options)
      ? field.options
          .filter((o) => isObject(o) && typeof o.id === 'string')
          .map((o) => ({ id: o.id, label: asString(o.label) }))
          .slice(0, MAX_OPTIONS)
      : undefined,
    accept: Array.isArray(field.accept)
      ? field.accept.filter((c) => fileCategories.includes(c))
      : undefined
  }
}

/** Reads file content; an empty file counts as a new form */
export function parseForm(content: string): FormDefinition {
  if (!content || !content.trim()) {
    return createForm()
  }
  let data: any
  try {
    data = JSON.parse(content)
  } catch {
    throw new FormFormatError('The file is not valid JSON')
  }
  if (!isObject(data) || !Number.isInteger(data.schemaVersion)) {
    throw new FormFormatError('The file has no schemaVersion')
  }
  if (data.schemaVersion > SCHEMA_VERSION) {
    throw new FormFormatError('The file was written by a newer version', true)
  }
  for (let version = data.schemaVersion; version < SCHEMA_VERSION; version++) {
    if (!migrations[version]) {
      throw new FormFormatError('Unsupported schema version')
    }
    data = migrations[version](data)
  }

  const defaults = createForm()
  const settings = isObject(data.settings) ? data.settings : {}
  const publication = data.publication
  return {
    schemaVersion: SCHEMA_VERSION,
    title: asString(data.title),
    description: asString(data.description),
    fields: (Array.isArray(data.fields) ? data.fields : []).filter(isField).map(normalizeField),
    archivedFields: (Array.isArray(data.archivedFields) ? data.archivedFields : [])
      .filter(isField)
      .map(normalizeField),
    settings: {
      spreadsheetLanguage: ['fr', 'es', 'de', 'en'].includes(settings.spreadsheetLanguage)
        ? settings.spreadsheetLanguage
        : defaults.settings.spreadsheetLanguage,
      acceptingResponses: settings.acceptingResponses === true,
      access: settings.access === 'public' ? 'public' : 'authenticated',
      collectIdentity: settings.collectIdentity !== false,
      confirmationMessage: asString(settings.confirmationMessage),
      submitLabel: asString(settings.submitLabel),
      accentColor: /^#[0-9a-f]{6}$/i.test(settings.accentColor)
        ? settings.accentColor
        : defaults.settings.accentColor,
      backgroundColor: /^#[0-9a-f]{6}$/i.test(settings.backgroundColor)
        ? settings.backgroundColor
        : defaults.settings.backgroundColor,
      backgroundImage:
        typeof settings.backgroundImage === 'string' &&
        /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(settings.backgroundImage) &&
        settings.backgroundImage.length <= MAX_BACKGROUND_DATA_URL_LENGTH
          ? settings.backgroundImage
          : defaults.settings.backgroundImage
    },
    publication:
      isObject(publication) &&
      typeof publication.formFileId === 'string' &&
      typeof publication.sealed === 'string'
        ? {
            formFileId: publication.formFileId,
            responsesFolderId: asString(publication.responsesFolderId),
            sealed: publication.sealed,
            publicToken: asString(publication.publicToken) || null,
            spreadsheetFileId: asString(publication.spreadsheetFileId) || null,
            links: isObject(publication.links) ? publication.links : {}
          }
        : null
  }
}

export function serializeForm(form: FormDefinition) {
  return JSON.stringify(form, null, 2) + '\n'
}

/**
 * Fingerprint of the questions, used to detect that a form changed between rendering
 * and submitting. FNV-1a is enough here: this is not a security boundary.
 */
export function fieldsRevision(fields: FormField[]) {
  const text = JSON.stringify(fields)
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** Human-readable answer, used by the responses view and the spreadsheet projection */
export function answerText(field: FormField, response: FormResponse, yesNo = ['Yes', 'No']) {
  if (field.type === 'file') {
    return response.files
      .filter(({ fieldId }) => fieldId === field.id)
      .map(({ name }) => name)
      .join('\n')
  }
  const value = response.answers[field.id]
  if (value === undefined) {
    return ''
  }
  const optionLabel = (id: string) => field.options?.find((o) => o.id === id)?.label ?? id
  if (Array.isArray(value)) {
    return value.map(optionLabel).join('\n')
  }
  if (field.type === 'radio' || field.type === 'select') {
    return optionLabel(String(value))
  }
  if (typeof value === 'boolean') {
    return value ? yesNo[0] : yesNo[1]
  }
  return String(value)
}

/** What a respondent may see: no publication data, no upload destinations */
export function respondentView(form: FormDefinition): RespondentForm {
  return {
    title: form.title,
    description: form.description,
    fields: form.fields.map((field) => {
      const copy = { ...field }
      delete copy.destinationFolderId
      return copy
    }),
    settings: {
      acceptingResponses: form.settings.acceptingResponses,
      confirmationMessage: form.settings.confirmationMessage,
      submitLabel: form.settings.submitLabel,
      accentColor: form.settings.accentColor,
      backgroundColor: form.settings.backgroundColor,
      backgroundImage: form.settings.backgroundImage
    },
    revision: fieldsRevision(form.fields)
  }
}

function checkText(field: FormField, value: string): ValidationError | null {
  const limit = TEXT_LIMITS[field.type]
  const maxLength = Math.min(asNumber(field.maxLength) ?? limit, limit)
  if (value.length > maxLength) {
    return 'tooLong'
  }
  if (value.length < (asNumber(field.minLength) ?? 0)) {
    return 'tooShort'
  }
  switch (field.type) {
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : 'invalid'
    case 'url':
      try {
        return ['http:', 'https:'].includes(new URL(value).protocol) ? null : 'invalid'
      } catch {
        return 'invalid'
      }
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        Number.isFinite(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value
        ? null
        : 'invalid'
    case 'time':
      return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? null : 'invalid'
  }
  return null
}

/**
 * Authoritative on the server, UX only in the browser. Unknown answer keys are dropped,
 * the returned answers only contain normalized values of known fields.
 */
export function validateSubmission(
  fields: FormField[],
  rawAnswers: unknown,
  files: Record<string, FileMeta[]> = {}
): { errors: Record<string, ValidationError>; answers: Answers } {
  const input = isObject(rawAnswers) ? rawAnswers : {}
  const errors: Record<string, ValidationError> = {}
  const answers: Answers = {}

  for (const field of fields) {
    const raw = input[field.id]
    const isEmpty = raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim())
    const optionIds = (field.options || []).map(({ id }) => id)

    if (field.type === 'file') {
      const list = files[field.id] || []
      const maxFiles = Math.min(asNumber(field.maxFiles) ?? 1, MAX_FILES_PER_FIELD)
      const maxBytes = (asNumber(field.maxSizeMb) ?? DEFAULT_MAX_SIZE_MB) * 1024 * 1024
      if (!list.length) {
        field.required && (errors[field.id] = 'required')
      } else if (list.length > maxFiles) {
        errors[field.id] = 'tooManyFiles'
      } else if (list.some(({ size }) => size > maxBytes)) {
        errors[field.id] = 'fileTooLarge'
      }
      continue
    }

    if (field.type === 'checkbox') {
      const values = Array.isArray(raw) ? raw : isEmpty ? [] : null
      if (!values || values.some((v) => typeof v !== 'string' || !optionIds.includes(v))) {
        errors[field.id] = 'invalid'
      } else if (!values.length) {
        field.required && (errors[field.id] = 'required')
      } else if (new Set(values).size !== values.length) {
        errors[field.id] = 'invalid'
      } else if (values.length > (asNumber(field.maxChoices) ?? optionIds.length)) {
        errors[field.id] = 'tooManyChoices'
      } else {
        answers[field.id] = values
      }
      continue
    }

    if (isEmpty) {
      field.required && (errors[field.id] = 'required')
      continue
    }

    switch (field.type) {
      case 'radio':
      case 'select':
        if (typeof raw === 'string' && optionIds.includes(raw)) {
          answers[field.id] = raw
        } else {
          errors[field.id] = 'invalid'
        }
        break
      case 'boolean':
        if (typeof raw === 'boolean') {
          answers[field.id] = raw
        } else {
          errors[field.id] = 'invalid'
        }
        break
      case 'number': {
        const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
        if (!Number.isFinite(value)) {
          errors[field.id] = 'invalid'
        } else if (value < (asNumber(field.min) ?? -Infinity)) {
          errors[field.id] = 'tooSmall'
        } else if (value > (asNumber(field.max) ?? Infinity)) {
          errors[field.id] = 'tooLarge'
        } else {
          answers[field.id] = value
        }
        break
      }
      default: {
        if (typeof raw !== 'string') {
          errors[field.id] = 'invalid'
          break
        }
        const value = field.type === 'textarea' ? raw : raw.trim()
        if (!value) {
          field.required && (errors[field.id] = 'required')
          break
        }
        const error = checkText(field, value)
        if (error) {
          errors[field.id] = error
        } else {
          answers[field.id] = value
        }
      }
    }
  }

  return { errors, answers }
}
