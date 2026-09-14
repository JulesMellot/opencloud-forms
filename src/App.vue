<template>
  <div
    class="ext:size-full ext:overflow-y-auto ext:bg-role-surface-container ext:text-role-on-surface"
  >
    <div class="ext:mx-auto ext:max-w-3xl ext:px-3 ext:py-4 ext:sm:px-6">
      <p
        v-if="formatError"
        role="alert"
        class="ext:rounded-lg ext:bg-role-error-container ext:p-4 ext:text-role-on-error-container"
      >
        {{ formatError }}
      </p>
      <template v-else-if="form">
        <respond-view v-if="isReadOnly" :form="respondentForm" :submit-fn="submitAsUser" />
        <template v-else>
          <p
            v-if="copyNotice"
            role="status"
            class="ext:mb-4 ext:rounded-lg ext:bg-role-secondary-container ext:p-3 ext:text-role-on-secondary-container"
          >
            {{
              $gettext(
                'This form is a copy. Its publication was reset: publish it to collect its own responses.'
              )
            }}
          </p>
          <div
            role="tablist"
            :aria-label="$gettext('Form sections')"
            class="ext:flex ext:flex-wrap ext:gap-1 ext:border-b ext:border-role-outline-variant"
          >
            <oc-button
              v-for="tab in tabs"
              :id="`forms-tab-${tab.id}`"
              :key="tab.id"
              role="tab"
              appearance="raw"
              :aria-selected="activeTab === tab.id"
              :aria-controls="`forms-panel-${tab.id}`"
              :class="[
                'ext:rounded-t ext:px-3 ext:py-2',
                activeTab === tab.id
                  ? 'ext:border-b-2 ext:border-role-primary ext:font-semibold'
                  : ''
              ]"
              @click="activeTab = tab.id"
            >
              {{ tab.label }}
            </oc-button>
          </div>
          <div
            :id="`forms-panel-${activeTab}`"
            role="tabpanel"
            :aria-labelledby="`forms-tab-${activeTab}`"
            class="ext:pt-4"
          >
            <questions-editor
              v-if="activeTab === 'questions'"
              v-model:form="form"
              :file-name="currentFileName"
              :renaming="renaming"
              @rename="renameFile"
              @choose-destination="chooseDestination"
              @clear-destination="clearDestination"
            />
            <responses-panel
              v-else-if="activeTab === 'responses'"
              v-model:form="form"
              :space="space"
              :resource="resource"
              :is-read-only="isReadOnly"
              @save="saveNow"
            />
            <settings-panel
              v-else-if="activeTab === 'settings'"
              v-model:form="form"
              :space="space"
              :resource="resource"
              :is-read-only="isReadOnly"
              @save="saveNow"
            />
            <respond-view v-else :form="respondentForm" preview />
          </div>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useGettext } from 'vue3-gettext'
import {
  LocationPickerModal,
  useClientService,
  useFolderLink,
  useMessages,
  useModals
} from '@opencloud-eu/web-pkg'
import { urlJoin, type Resource, type SpaceResource } from '@opencloud-eu/web-client'
import QuestionsEditor from './components/QuestionsEditor.vue'
import ResponsesPanel from './components/ResponsesPanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import RespondView from './components/RespondView.vue'
import { useFormsApi, usePublication, type Submission } from './composables'
import {
  FormFormatError,
  parseForm,
  respondentView,
  serializeForm,
  type FormDefinition,
  type FormField
} from './schema'

const props = defineProps<{
  space: SpaceResource
  resource: Resource
  currentContent: string
  isReadOnly: boolean
  isDirty: boolean
}>()

const emit = defineEmits<{
  'update:currentContent': [value: string]
  save: []
  close: []
}>()

const { $gettext } = useGettext()
const { dispatchModal } = useModals()
const { showMessage, showErrorMessage } = useMessages()
const { getParentFolderLink } = useFolderLink()
const clientService = useClientService()
const api = useFormsApi()
const publication = usePublication()

const form = ref<FormDefinition>()
const formatError = ref('')
const copyNotice = ref(false)
const renaming = ref(false)
const currentFileName = ref(props.resource.name || '')
const activeTab = ref<'questions' | 'responses' | 'settings' | 'preview'>('questions')
let publicSyncTimer: number | undefined
let publicSyncQueue: Promise<unknown> = Promise.resolve()

const tabs = computed(() => [
  { id: 'questions' as const, label: $gettext('Questions') },
  { id: 'responses' as const, label: $gettext('Responses') },
  { id: 'settings' as const, label: $gettext('Settings') },
  { id: 'preview' as const, label: $gettext('Preview') }
])

const respondentForm = computed(() => {
  const view = respondentView(form.value)
  // a form without its own publication cannot store responses
  view.settings.acceptingResponses &&= form.value.publication?.formFileId === props.resource.fileId
  return view
})

function load() {
  currentFileName.value = props.resource.name || ''
  try {
    const parsed = parseForm(props.currentContent)
    copyNotice.value =
      !props.isReadOnly &&
      !!parsed.publication &&
      parsed.publication.formFileId !== props.resource.fileId
    if (copyNotice.value) {
      // the links belong to the original form: a copy starts unpublished
      parsed.publication = null
      parsed.settings.acceptingResponses = false
      parsed.fields.forEach((field) => delete field.destinationFolderId)
    }
    form.value = parsed
    formatError.value = ''
  } catch (e) {
    form.value = undefined
    formatError.value =
      e instanceof FormFormatError && e.tooNew
        ? $gettext('This form was created with a newer version of Forms and cannot be opened.')
        : $gettext('This file is not a valid form.')
  }
}

watch(() => props.resource?.id, load, { immediate: true })

watch(
  form,
  (value) => {
    if (!value || props.isReadOnly) {
      return
    }
    const content = serializeForm(value)
    if (content !== props.currentContent) {
      emit('update:currentContent', content)
    }
    schedulePublicSync(value)
  },
  { deep: true }
)

function schedulePublicSync(value: FormDefinition) {
  const current = value.publication
  if (props.isReadOnly || value.settings.access !== 'public' || !current?.publicToken) {
    return
  }
  window.clearTimeout(publicSyncTimer)
  publicSyncTimer = window.setTimeout(() => {
    publicSyncQueue = publicSyncQueue
      .catch((): void => undefined)
      .then(() => publication.syncPublicPublication(current, value))
      .catch((e) => console.error('OpenCloud Forms could not refresh the public form', e))
  }, 600)
}

onBeforeUnmount(() => window.clearTimeout(publicSyncTimer))

async function saveNow() {
  // let the content watcher hand the latest form to the wrapper before saving
  await nextTick()
  emit('save')
}

function parentPath(path: string) {
  return path.substring(0, path.lastIndexOf('/')) || '/'
}

async function saveBeforeRename() {
  if (!props.isDirty) {
    return
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      stop()
      reject(new Error('saveTimeout'))
    }, 15_000)
    const stop = watch(
      () => props.isDirty,
      (dirty) => {
        if (!dirty) {
          window.clearTimeout(timeout)
          stop()
          resolve()
        }
      }
    )
    emit('save')
  })
}

async function renameFile(title: string) {
  const baseName = title
    .trim()
    .replace(/\.ocform$/i, '')
    .replace(/[\\/]/g, '-')
    .trim()
  if (!baseName) {
    showErrorMessage({ title: $gettext('Enter a name before renaming the file') })
    return
  }
  const fileName = `${baseName}.ocform`
  if (fileName === currentFileName.value) {
    return
  }

  renaming.value = true
  try {
    await saveBeforeRename()
    const path = urlJoin(parentPath(props.resource.path), fileName)
    await clientService.webdav.moveFiles(
      props.space,
      { fileId: props.resource.fileId },
      props.space,
      { path }
    )
    currentFileName.value = fileName
    showMessage({ title: $gettext('The questionnaire was renamed') })
  } catch (e) {
    console.error(e)
    showErrorMessage({ title: $gettext('The questionnaire could not be renamed'), errors: [e] })
  } finally {
    renaming.value = false
  }
}

function submitAsUser(submission: Submission) {
  return api.submitAuthenticated(props.resource.fileId, submission)
}

function requirePublication() {
  if (form.value.publication) {
    return true
  }
  dispatchModal({
    title: $gettext('Publish the form first'),
    message: $gettext('Upload folders can be chosen once the form is published.'),
    hideCancelButton: true,
    confirmText: $gettext('OK')
  })
  return false
}

async function changeDestination(change: () => Promise<void>) {
  try {
    await change()
    await saveNow()
  } catch (e) {
    console.error(e)
    showErrorMessage({ title: $gettext('The upload folder could not be changed'), errors: [e] })
  }
}

function chooseDestination(field: FormField) {
  if (!requirePublication()) {
    return
  }
  dispatchModal({
    elementClass: 'location-picker-modal',
    title: $gettext('Choose the folder for uploaded files'),
    customComponent: markRaw(LocationPickerModal),
    hideActions: true,
    customComponentAttrs: () => ({
      submitButtonTitle: $gettext('Use this folder'),
      parentFolderLink: getParentFolderLink(props.resource),
      callbackFn: ([folder]: Resource[]) =>
        changeDestination(() => publication.setDestination(form.value.publication, field, folder))
    }),
    focusTrapInitial: false
  })
}

function clearDestination(field: FormField) {
  return changeDestination(() => publication.clearDestination(form.value.publication, field))
}
</script>
