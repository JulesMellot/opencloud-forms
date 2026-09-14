import { Resource, SpaceResource, urlJoin } from '@opencloud-eu/web-client'
import { SharingLinkType } from '@opencloud-eu/web-client/graph/generated'
import { useClientService, useConfigStore, usePasswordPolicyService } from '@opencloud-eu/web-pkg'
import { useGettext } from 'vue3-gettext'
import type {
  Answers,
  FieldType,
  FileCategory,
  FormDefinition,
  FormField,
  LinkRef,
  LinkSecret,
  Publication,
  RespondentForm,
  ValidationError
} from './schema'

export interface Submission {
  submissionId: string
  revision: string
  answers: Answers
  files: Record<string, File[]>
}

/** Status and error code of a failed request to forms-server or OpenCloud */
export function requestError(e: any): {
  status: number
  code: string
  fields?: Record<string, ValidationError>
} {
  return {
    status: e?.response?.status ?? e?.statusCode ?? 0,
    code: e?.response?.data?.error ?? '',
    fields: e?.response?.data?.fields
  }
}

function parentPath(path: string) {
  return path.substring(0, path.lastIndexOf('/')) || '/'
}

export function useFormsApi() {
  const clientService = useClientService()
  const configStore = useConfigStore()

  const url = (...parts: string[]) =>
    urlJoin(configStore.serverUrl, 'forms-api', 'v1', ...parts.map(encodeURIComponent))

  function submissionBody({ files, ...payload }: Submission) {
    const uploads = Object.entries(files).flatMap(([fieldId, list]) =>
      list.map((file) => [fieldId, file] as const)
    )
    if (!uploads.length) {
      return payload
    }
    const data = new FormData()
    data.append('payload', JSON.stringify(payload))
    uploads.forEach(([fieldId, file]) => data.append(`file:${fieldId}`, file, file.name))
    return data
  }

  return {
    publicUrl: (token: string) => urlJoin(configStore.serverUrl, 'forms-api', 'p', token),
    privateUrl: (fileId: string) => urlJoin(configStore.serverUrl, 'f', fileId),

    async seal(body: Record<string, unknown>) {
      const { data } = await clientService.httpAuthenticated.post<{ sealed: string }>(
        url('seal'),
        body
      )
      return data.sealed
    },

    async getPublicForm(token: string) {
      const { data } = await clientService.httpUnAuthenticated.get<RespondentForm>(
        url('public', token)
      )
      return data
    },

    submitPublic(token: string, submission: Submission) {
      return clientService.httpUnAuthenticated.post(
        url('public', token, 'submissions'),
        submissionBody(submission)
      )
    },

    submitAuthenticated(fileId: string, submission: Submission) {
      return clientService.httpAuthenticated.post(
        url('forms', fileId, 'submissions'),
        submissionBody(submission)
      )
    },

    async syncSpreadsheet(fileId: string, sealed?: string) {
      const { data } = await clientService.httpAuthenticated.post<{ rows: number }>(
        url('forms', fileId, 'spreadsheet', 'sync'),
        { sealed }
      )
      return data
    },

    async syncPublicPublication(fileId: string, form: FormDefinition, publicToken?: string | null) {
      const { data } = await clientService.httpAuthenticated.post<{ publicToken: string }>(
        url('forms', fileId, 'publication', 'sync'),
        { form, sealed: form.publication?.sealed, publicToken }
      )
      return data.publicToken
    }
  }
}

/**
 * Publishing relies on OpenCloud sharing: password-protected links created by the editor
 * give forms-server the narrow storage access it needs. Their secrets only travel sealed.
 */
export function usePublication() {
  const clientService = useClientService()
  const passwordPolicyService = usePasswordPolicyService()
  const api = useFormsApi()
  const { $gettext } = useGettext()

  const driveIdOf = (itemId: string) => itemId.substring(0, itemId.indexOf('!'))

  async function createLink(itemId: string, type: SharingLinkType) {
    const password = passwordPolicyService.generatePassword()
    const link = await clientService.graphAuthenticated.permissions.createLink(
      driveIdOf(itemId),
      itemId,
      { type, password, displayName: $gettext('OpenCloud Forms (do not delete)') }
    )
    const secret: LinkSecret = { token: link.webUrl.split('/').pop(), password }
    const ref: LinkRef = { itemId, permissionId: link.id }
    return { secret, ref }
  }

  async function deleteLink(ref: LinkRef | undefined) {
    if (!ref) {
      return
    }
    try {
      await clientService.graphAuthenticated.permissions.deletePermission(
        driveIdOf(ref.itemId),
        ref.itemId,
        ref.permissionId
      )
    } catch (e) {
      // already gone together with its resource
      if (requestError(e).status !== 404) {
        throw e
      }
    }
  }

  async function createUnique<T>(
    name: string,
    extension: string,
    create: (name: string) => Promise<T>
  ) {
    for (let i = 1; ; i++) {
      const candidate = i === 1 ? `${name}${extension}` : `${name} (${i})${extension}`
      try {
        return await create(candidate)
      } catch (e) {
        if (![405, 409, 412].includes(requestError(e).status) || i > 50) {
          throw e
        }
      }
    }
  }

  async function publish(
    space: SpaceResource,
    resource: Resource,
    access: 'authenticated' | 'public',
    form: FormDefinition
  ): Promise<Publication> {
    const baseName = resource.name.replace(/\.ocform$/, '')
    const folder = await createUnique(
      `.${$gettext('%{name} – responses', { name: baseName })}`,
      '',
      (name) =>
        clientService.webdav.createFolder(space, { path: urlJoin(parentPath(resource.path), name) })
    )
    let responses: Awaited<ReturnType<typeof createLink>> | undefined
    try {
      // "upload" lets the server store and read responses, but not delete them
      responses = await createLink(folder.fileId, SharingLinkType.Upload)
      const sealed = await api.seal({
        formFileId: resource.fileId,
        credentials: {
          kind: 'private',
          formFileId: resource.fileId,
          responses: responses.secret,
          destinations: {},
          sheet: null
        }
      })
      const publication: Publication = {
        formFileId: resource.fileId,
        responsesFolderId: folder.fileId,
        sealed,
        publicToken: null,
        spreadsheetFileId: null,
        links: { responses: responses.ref }
      }
      if (access === 'public') {
        await syncPublicPublication(publication, form, 'public')
      }
      return publication
    } catch (e) {
      try {
        await deleteLink(responses?.ref)
        await clientService.webdav.deleteFile(space, { path: folder.path })
      } catch (cleanupError) {
        console.warn('OpenCloud Forms could not clean up a failed publication', cleanupError)
      }
      throw e
    }
  }

  async function syncPublicPublication(
    publication: Publication,
    form: FormDefinition,
    access = form.settings.access
  ) {
    const snapshot = JSON.parse(JSON.stringify(form)) as FormDefinition
    snapshot.settings.access = access
    snapshot.publication = publication
    const publicToken = await api.syncPublicPublication(
      publication.formFileId,
      snapshot,
      publication.publicToken
    )
    if (access === 'public') {
      publication.publicToken = publicToken
    }
  }

  async function enablePublicLink(publication: Publication, form: FormDefinition) {
    await syncPublicPublication(publication, form, 'public')

    // Older versions shared the .ocform itself. The standalone public page does not need that
    // permission, and a stale legacy permission must never block recovery.
    const staleView = publication.links.view
    try {
      await deleteLink(staleView)
    } catch (e) {
      console.warn('OpenCloud Forms could not remove a stale public link', e)
    }
    delete publication.links.view
  }

  async function disablePublicLink(publication: Publication, form: FormDefinition) {
    // Revokes existing public URLs without deleting the response storage used by signed-in users.
    await syncPublicPublication(publication, form, 'authenticated')
    try {
      await deleteLink(publication.links.view)
    } catch (e) {
      console.warn('OpenCloud Forms could not remove a legacy public link', e)
    }
    delete publication.links.view
    publication.publicToken = null
  }

  async function revoke(publication: Publication) {
    for (const ref of Object.values(publication.links)) {
      await deleteLink(ref)
    }
  }

  async function reseal(publication: Publication, patch: Record<string, unknown>) {
    publication.sealed = await api.seal({
      formFileId: publication.formFileId,
      base: publication.sealed,
      patch
    })
  }

  async function setDestination(publication: Publication, field: FormField, folder: Resource) {
    const { secret, ref } = await createLink(folder.fileId, SharingLinkType.CreateOnly)
    await deleteLink(publication.links[`destination:${field.id}`])
    await reseal(publication, { destinations: { [field.id]: secret } })
    publication.links[`destination:${field.id}`] = ref
    field.destinationFolderId = folder.fileId
  }

  async function clearDestination(publication: Publication, field: FormField) {
    await reseal(publication, { destinations: { [field.id]: null } })
    await deleteLink(publication.links[`destination:${field.id}`])
    delete publication.links[`destination:${field.id}`]
    delete field.destinationFolderId
  }

  async function useSpreadsheet(publication: Publication, spreadsheet: Resource) {
    const { secret, ref } = await createLink(spreadsheet.fileId, SharingLinkType.Edit)
    await deleteLink(publication.links.spreadsheet)
    await reseal(publication, { sheet: secret })
    publication.links.spreadsheet = ref
    publication.spreadsheetFileId = spreadsheet.fileId
    await api.syncSpreadsheet(publication.formFileId, publication.sealed)
  }

  async function createSpreadsheet(
    publication: Publication,
    space: SpaceResource,
    formName: string,
    folder: Resource
  ) {
    const folderPath = folder.path || (await clientService.webdav.getPathForFileId(folder.fileId))
    const spreadsheet = await createUnique(
      $gettext('%{name} – responses', { name: formName.replace(/\.ocform$/, '') }),
      '.ods',
      (name) => clientService.webdav.putFileContents(space, { path: urlJoin(folderPath, name) })
    )
    await useSpreadsheet(publication, spreadsheet)
  }

  async function unlinkSpreadsheet(publication: Publication) {
    await reseal(publication, { sheet: null })
    await deleteLink(publication.links.spreadsheet)
    delete publication.links.spreadsheet
    publication.spreadsheetFileId = null
  }

  return {
    publish,
    syncPublicPublication,
    enablePublicLink,
    disablePublicLink,
    revoke,
    setDestination,
    clearDestination,
    createSpreadsheet,
    useSpreadsheet,
    unlinkSpreadsheet
  }
}

export function useFieldTypes() {
  const { $gettext } = useGettext()
  const types: { value: FieldType; label: string }[] = [
    { value: 'text', label: $gettext('Short text') },
    { value: 'textarea', label: $gettext('Long text') },
    { value: 'number', label: $gettext('Number') },
    { value: 'email', label: $gettext('Email') },
    { value: 'url', label: $gettext('URL') },
    { value: 'radio', label: $gettext('Single choice') },
    { value: 'checkbox', label: $gettext('Multiple choice') },
    { value: 'select', label: $gettext('Dropdown') },
    { value: 'boolean', label: $gettext('Yes / No') },
    { value: 'date', label: $gettext('Date') },
    { value: 'time', label: $gettext('Time') },
    { value: 'file', label: $gettext('File upload') }
  ]
  const categories: { value: FileCategory; label: string }[] = [
    { value: 'any', label: $gettext('Any file') },
    { value: 'image', label: $gettext('Images') },
    { value: 'video', label: $gettext('Videos') },
    { value: 'audio', label: $gettext('Audio') },
    { value: 'pdf', label: $gettext('PDF') },
    { value: 'document', label: $gettext('Documents') },
    { value: 'archive', label: $gettext('Archives') }
  ]
  return { types, categories }
}

export function useValidationMessages() {
  const { $gettext } = useGettext()
  return (field: FormField, error: ValidationError | undefined) => {
    switch (error) {
      case 'required':
        return $gettext('This question is required.')
      case 'invalid':
        return $gettext('This answer is not valid.')
      case 'tooShort':
        return $gettext('Enter at least %{count} characters.', { count: String(field.minLength) })
      case 'tooLong':
        return $gettext('This answer is too long.')
      case 'tooSmall':
        return $gettext('Enter a number of at least %{min}.', { min: String(field.min) })
      case 'tooLarge':
        return $gettext('Enter a number of at most %{max}.', { max: String(field.max) })
      case 'tooManyChoices':
        return $gettext('Select at most %{count} options.', { count: String(field.maxChoices) })
      case 'fileType':
        return $gettext('This type of file is not accepted.')
      case 'fileTooLarge':
        return $gettext('Each file must be smaller than %{size} MB.', {
          size: String(field.maxSizeMb)
        })
      case 'tooManyFiles':
        return $gettext('You can upload at most %{count} files.', {
          count: String(field.maxFiles ?? 1)
        })
    }
    return undefined
  }
}
