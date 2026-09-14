<template>
  <div class="ext:flex ext:flex-col ext:gap-4">
    <p v-if="!form.publication" :class="card">
      {{ $gettext('Publish the form to start collecting responses.') }}
    </p>
    <template v-else>
      <section :class="card" aria-labelledby="forms-spreadsheet-heading">
        <h2 id="forms-spreadsheet-heading" class="ext:text-lg ext:font-semibold">
          {{ $gettext('Spreadsheet') }}
        </h2>
        <template v-if="form.publication.spreadsheetFileId">
          <p>
            {{
              $gettext(
                'The spreadsheet is rebuilt from the responses after each new response. Changes made in it are overwritten.'
              )
            }}
          </p>
          <div class="ext:flex ext:flex-wrap ext:gap-2">
            <oc-button
              type="a"
              :href="api.privateUrl(form.publication.spreadsheetFileId)"
              appearance="outline"
            >
              <oc-icon name="table" size="small" />
              {{ $gettext('Open spreadsheet') }}
            </oc-button>
            <oc-button appearance="outline" :disabled="busy" :show-spinner="busy" @click="sync">
              <oc-icon name="refresh" size="small" />
              {{ $gettext('Update now') }}
            </oc-button>
            <oc-button appearance="raw" :disabled="busy || isReadOnly" @click="unlinkSpreadsheet">
              {{ $gettext('Unlink') }}
            </oc-button>
          </div>
        </template>
        <template v-else>
          <p>
            {{
              $gettext(
                'Choose where to create one OpenCloud spreadsheet. Every response is added to this same file, one row per response.'
              )
            }}
          </p>
          <div class="ext:flex ext:flex-wrap ext:gap-2">
            <oc-button
              appearance="outline"
              :disabled="busy || isReadOnly"
              :show-spinner="busy"
              @click="chooseSpreadsheetLocation"
            >
              {{ $gettext('Choose a folder and create the spreadsheet') }}
            </oc-button>
            <oc-button appearance="raw" :disabled="busy || isReadOnly" @click="pickSpreadsheet">
              {{ $gettext('Use an existing spreadsheet') }}
            </oc-button>
          </div>
        </template>
        <p v-if="syncStatus" role="status" class="ext:text-sm">{{ syncStatus }}</p>
      </section>

      <section :class="card" aria-labelledby="forms-responses-heading">
        <div class="ext:flex ext:flex-wrap ext:items-center ext:justify-between ext:gap-2">
          <h2 id="forms-responses-heading" class="ext:text-lg ext:font-semibold">
            {{
              $ngettext('%{count} response', '%{count} responses', entries.length, {
                count: String(entries.length)
              })
            }}
          </h2>
          <oc-button appearance="outline" :disabled="loading" @click="load">
            <oc-icon name="refresh" size="small" />
            {{ $gettext('Refresh') }}
          </oc-button>
        </div>

        <div v-if="loading" class="ext:flex ext:justify-center ext:p-4">
          <oc-spinner :aria-label="$gettext('Loading responses')" />
        </div>
        <p v-else-if="loadError" role="alert" class="ext:text-role-error">{{ loadError }}</p>
        <p v-else-if="!entries.length">{{ $gettext('No responses yet.') }}</p>
        <template v-else>
          <div class="ext:overflow-x-auto">
            <table class="ext:w-full ext:border-collapse ext:text-left">
              <thead>
                <tr class="ext:border-b ext:border-role-outline-variant">
                  <th scope="col" class="ext:p-2">{{ $gettext('Submitted') }}</th>
                  <th v-if="withRespondents" scope="col" class="ext:p-2">
                    {{ $gettext('Respondent') }}
                  </th>
                  <th v-for="field in summaryFields" :key="field.id" scope="col" class="ext:p-2">
                    {{ field.label || $gettext('Untitled question') }}
                  </th>
                  <th scope="col" class="ext:p-2">
                    <span class="ext:sr-only">{{ $gettext('Actions') }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="entry in page"
                  :key="entry.resource.id"
                  class="ext:border-b ext:border-role-outline-variant"
                >
                  <td class="ext:p-2 ext:whitespace-nowrap">{{ submittedAt(entry) }}</td>
                  <td v-if="withRespondents" class="ext:p-2">
                    {{ entry.response?.respondent?.displayName }}
                  </td>
                  <td
                    v-for="field in summaryFields"
                    :key="field.id"
                    class="ext:max-w-60 ext:truncate ext:p-2"
                  >
                    {{ entry.response ? answer(field, entry.response) : '' }}
                  </td>
                  <td class="ext:p-2 ext:text-right">
                    <oc-button
                      appearance="raw"
                      :disabled="!entry.response"
                      @click="selected = entry"
                    >
                      {{ $gettext('View') }}
                    </oc-button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <nav
            v-if="pageCount > 1"
            class="ext:flex ext:items-center ext:justify-center ext:gap-3"
            :aria-label="$gettext('Responses pages')"
          >
            <oc-button
              appearance="outline"
              size="small"
              :disabled="pageIndex === 0"
              @click="goTo(pageIndex - 1)"
            >
              {{ $gettext('Previous') }}
            </oc-button>
            <span>
              {{
                $gettext('Page %{page} of %{pages}', {
                  page: String(pageIndex + 1),
                  pages: String(pageCount)
                })
              }}
            </span>
            <oc-button
              appearance="outline"
              size="small"
              :disabled="pageIndex >= pageCount - 1"
              @click="goTo(pageIndex + 1)"
            >
              {{ $gettext('Next') }}
            </oc-button>
          </nav>
        </template>
      </section>

      <section v-if="selected?.response" :class="card" aria-labelledby="forms-response-heading">
        <div class="ext:flex ext:flex-wrap ext:items-center ext:justify-between ext:gap-2">
          <h2 id="forms-response-heading" class="ext:text-lg ext:font-semibold">
            {{ $gettext('Response of %{date}', { date: submittedAt(selected) }) }}
          </h2>
          <div class="ext:flex ext:gap-2">
            <oc-button appearance="outline" :disabled="isReadOnly" @click="confirmDelete(selected)">
              <oc-icon name="delete-bin" size="small" />
              {{ $gettext('Delete') }}
            </oc-button>
            <oc-button appearance="raw" @click="selected = null">{{ $gettext('Close') }}</oc-button>
          </div>
        </div>
        <p v-if="selected.response.respondent">
          {{ $gettext('Respondent: %{name}', { name: selected.response.respondent.displayName }) }}
        </p>
        <dl class="ext:flex ext:flex-col ext:gap-3">
          <div v-for="field in detailFields(selected.response)" :key="field.id">
            <dt class="ext:font-semibold">
              {{ field.label || $gettext('Untitled question') }}
              <span v-if="isArchived(field)" class="ext:text-sm ext:font-normal"
                >({{ $gettext('deleted question') }})</span
              >
            </dt>
            <dd v-if="field.type === 'file'" class="ext:flex ext:flex-col">
              <a
                v-for="file in selected.response.files.filter((f) => f.fieldId === field.id)"
                :key="file.storedName"
                :href="api.privateUrl(file.fileId)"
                class="ext:underline"
              >
                {{ file.name }}
              </a>
            </dd>
            <dd v-else class="ext:whitespace-pre-line ext:break-words">
              {{ answer(field, selected.response) || '—' }}
            </dd>
          </div>
        </dl>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, markRaw, onMounted, ref, unref } from 'vue'
import { useGettext } from 'vue3-gettext'
import {
  FilePickerModal,
  formatDateFromJSDate,
  LocationPickerModal,
  useClientService,
  useFolderLink,
  useMessages,
  useModals
} from '@opencloud-eu/web-pkg'
import type { Resource, SpaceResource } from '@opencloud-eu/web-client'
import { requestError, useFormsApi, usePublication } from '../composables'
import { answerText, type FormDefinition, type FormField, type FormResponse } from '../schema'

interface Entry {
  resource: Resource
  response: FormResponse | null
}

const PAGE_SIZE = 25

const { space, resource, isReadOnly } = defineProps<{
  space: SpaceResource
  resource: Resource
  isReadOnly: boolean
}>()
const form = defineModel<FormDefinition>('form', { required: true })
const emit = defineEmits<{ save: [] }>()

const card =
  'ext:flex ext:flex-col ext:gap-3 ext:rounded-lg ext:border ext:border-role-outline-variant ext:bg-role-surface ext:p-4'

const { $gettext, $ngettext, current: language } = useGettext()
const clientService = useClientService()
const { showMessage, showErrorMessage } = useMessages()
const { dispatchModal } = useModals()
const { getParentFolderLink } = useFolderLink()
const api = useFormsApi()
const publication = usePublication()

// ponytail: lists every response name at once and loads contents page by page; shard the
// responses folder if forms reach tens of thousands of responses
const entries = ref<Entry[]>([])
const pageIndex = ref(0)
const selected = ref<Entry | null>(null)
const loading = ref(false)
const loadError = ref('')
const busy = ref(false)
const syncStatus = ref('')

const pageCount = computed(() => Math.ceil(entries.value.length / PAGE_SIZE))
const page = computed(() =>
  entries.value.slice(pageIndex.value * PAGE_SIZE, (pageIndex.value + 1) * PAGE_SIZE)
)
const summaryFields = computed(() => form.value.fields.filter((f) => f.type !== 'file').slice(0, 3))
const withRespondents = computed(() => page.value.some((e) => e.response?.respondent))

function answer(field: FormField, response: FormResponse) {
  return answerText(field, response, [$gettext('Yes'), $gettext('No')])
}

function submittedAt(entry: Entry) {
  const date = entry.response?.submittedAt ?? entry.resource.mdate
  return formatDateFromJSDate(new Date(date), language)
}

function isArchived(field: FormField) {
  return !form.value.fields.includes(field)
}

function detailFields(response: FormResponse) {
  const archived = form.value.archivedFields.filter(
    (f) =>
      response.answers[f.id] !== undefined || response.files.some((file) => file.fieldId === f.id)
  )
  return [...form.value.fields, ...archived]
}

async function loadPage() {
  await Promise.all(
    page.value
      .filter((entry) => !entry.response)
      .map(async (entry) => {
        try {
          const { body } = await clientService.webdav.getFileContents(space, {
            fileId: entry.resource.fileId
          })
          entry.response = typeof body === 'string' ? JSON.parse(body) : body
        } catch (e) {
          console.error(e)
        }
      })
  )
}

async function load() {
  loading.value = true
  loadError.value = ''
  selected.value = null
  try {
    const path = await clientService.webdav.getPathForFileId(
      form.value.publication.responsesFolderId
    )
    const { children } = await clientService.webdav.listFiles(space, { path })
    entries.value = children
      .filter((child) => !child.isFolder && child.name.endsWith('.json'))
      .sort((a, b) => Date.parse(b.mdate) - Date.parse(a.mdate))
      .map((child): Entry => ({ resource: child, response: null }))
    pageIndex.value = 0
    await loadPage()
  } catch (e) {
    const { status } = requestError(e)
    loadError.value =
      status === 404
        ? $gettext('The responses folder was deleted or is in the trash.')
        : status === 403 || status === 401
          ? $gettext("You don't have access to the responses folder.")
          : $gettext('The responses could not be loaded.')
  } finally {
    loading.value = false
  }
}

async function goTo(index: number) {
  pageIndex.value = index
  await loadPage()
}

async function sync() {
  busy.value = true
  syncStatus.value = ''
  try {
    const { rows } = await api.syncSpreadsheet(resource.fileId)
    syncStatus.value = $ngettext(
      '%{count} response in the spreadsheet',
      '%{count} responses in the spreadsheet',
      rows,
      { count: String(rows) }
    )
  } catch (e) {
    const { code } = requestError(e)
    syncStatus.value =
      code === 'spreadsheetMissing' || code === 'storageUnavailable'
        ? $gettext(
            'The spreadsheet was deleted or cannot be written anymore. Unlink it and create a new one.'
          )
        : $gettext('The spreadsheet could not be updated.')
  } finally {
    busy.value = false
  }
}

async function changePublication(change: () => Promise<void>) {
  busy.value = true
  syncStatus.value = ''
  try {
    await change()
    emit('save')
  } catch (e) {
    console.error(e)
    showErrorMessage({ title: $gettext('The spreadsheet could not be set up'), errors: [e] })
  } finally {
    busy.value = false
  }
}

function chooseSpreadsheetLocation() {
  dispatchModal({
    elementClass: 'location-picker-modal',
    title: $gettext('Choose where to save the responses spreadsheet'),
    customComponent: markRaw(LocationPickerModal),
    hideActions: true,
    customComponentAttrs: () => ({
      submitButtonTitle: $gettext('Create the spreadsheet here'),
      parentFolderLink: getParentFolderLink(resource),
      callbackFn: ([folder]: Resource[]) =>
        changePublication(() =>
          publication.createSpreadsheet(form.value.publication, space, resource.name, folder)
        )
    }),
    focusTrapInitial: false
  })
}

function unlinkSpreadsheet() {
  return changePublication(() => publication.unlinkSpreadsheet(form.value.publication))
}

function pickSpreadsheet() {
  dispatchModal({
    elementClass: 'file-picker-modal',
    title: $gettext('Choose a spreadsheet'),
    customComponent: markRaw(FilePickerModal),
    hideActions: true,
    customComponentAttrs: () => ({
      allowedFileTypes: ['application/vnd.oasis.opendocument.spreadsheet'],
      parentFolderLink: getParentFolderLink(resource),
      callbackFn: ({ resource: spreadsheet }: { resource: Resource }) =>
        changePublication(() => publication.useSpreadsheet(form.value.publication, spreadsheet))
    }),
    focusTrapInitial: false
  })
}

function confirmDelete(entry: Entry) {
  dispatchModal({
    title: $gettext('Delete this response?'),
    message: $gettext('The response file is moved to the trash of its space.'),
    confirmText: $gettext('Delete'),
    onConfirm: async () => {
      try {
        await clientService.webdav.deleteFile(space, { path: entry.resource.path })
        entries.value = entries.value.filter((e) => e !== entry)
        selected.value = null
        showMessage({ title: $gettext('Response deleted') })
        if (form.value.publication?.spreadsheetFileId) {
          await sync()
        }
      } catch (e) {
        showErrorMessage({ title: $gettext('The response could not be deleted'), errors: [e] })
      }
    }
  })
}

onMounted(() => {
  if (unref(form).publication) {
    load()
  }
})
</script>
