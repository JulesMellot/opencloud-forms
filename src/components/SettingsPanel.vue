<template>
  <div class="ext:flex ext:flex-col ext:gap-4">
    <section :class="card" aria-labelledby="forms-publication-heading">
      <h2 id="forms-publication-heading" class="ext:text-lg ext:font-semibold">
        {{ $gettext('Publication') }}
      </h2>
      <template v-if="!form.publication">
        <p>
          {{
            $gettext(
              'Publishing creates a responses folder next to this form. Only people with access to that folder can read the responses.'
            )
          }}
        </p>
        <div class="ext:flex ext:flex-wrap ext:gap-2">
          <oc-button
            appearance="filled"
            :disabled="busy || isReadOnly"
            :show-spinner="busy"
            @click="publishPublic"
          >
            <oc-icon name="link" size="small" />
            {{ $gettext('Create a public link') }}
          </oc-button>
          <oc-button appearance="outline" :disabled="busy || isReadOnly" @click="publish">
            {{ $gettext('Publish for OpenCloud users') }}
          </oc-button>
        </div>
        <p class="ext:text-sm">
          {{
            $gettext(
              'A public link lets anyone answer without an OpenCloud account. It does not expose the responses.'
            )
          }}
        </p>
      </template>
      <template v-else>
        <oc-switch
          :checked="form.settings.acceptingResponses"
          :label="$gettext('Accept responses')"
          :disabled="busy"
          @update:checked="
            (checked: boolean) => update(() => (form.settings.acceptingResponses = checked))
          "
        />
        <div class="ext:flex ext:flex-col ext:gap-3">
          <div
            v-if="publicLinkNeedsRepair"
            role="alert"
            class="ext:flex ext:flex-col ext:gap-2 ext:rounded-lg ext:bg-role-error-container ext:p-3 ext:text-role-on-error-container"
          >
            <p>
              {{
                $gettext(
                  'The anonymous link is not active yet. Do not send the private OpenCloud link.'
                )
              }}
            </p>
            <oc-button
              appearance="filled"
              class="ext:self-start"
              :disabled="busy || isReadOnly"
              :show-spinner="busy"
              @click="ensurePublicLink"
            >
              {{ $gettext('Repair the public link') }}
            </oc-button>
          </div>
          <copy-field
            v-else
            :label="
              form.settings.access === 'public'
                ? $gettext('Public link')
                : $gettext('Link for people this form is shared with')
            "
            :value="respondLink"
          />
          <div v-if="publicLinkReady" class="ext:flex ext:flex-wrap ext:gap-2">
            <oc-button type="a" :href="respondLink" target="_blank" appearance="outline">
              <oc-icon name="external-link" size="small" />
              {{ $gettext('Open the public form') }}
            </oc-button>
            <oc-button type="a" :href="emailLink" appearance="filled">
              <oc-icon name="mail" size="small" />
              {{ $gettext('Send by email') }}
            </oc-button>
          </div>
          <p v-if="form.settings.access === 'authenticated'" class="ext:text-sm">
            {{
              $gettext(
                'Share this form with people or groups using the OpenCloud share panel. They open it to respond.'
              )
            }}
          </p>
          <a
            :href="api.privateUrl(form.publication.responsesFolderId)"
            class="ext:self-start ext:underline"
          >
            {{ $gettext('Open the responses folder') }}
          </a>
        </div>
        <oc-button
          appearance="outline"
          class="ext:self-start"
          :disabled="busy"
          @click="confirmRevoke"
        >
          {{ $gettext('Stop publishing') }}
        </oc-button>
      </template>
    </section>

    <section :class="card">
      <fieldset class="ext:flex ext:flex-col ext:gap-2">
        <legend class="ext:mb-2 ext:text-lg ext:font-semibold">
          {{ $gettext('Who can respond') }}
        </legend>
        <label
          v-for="option in accessOptions"
          :key="option.value"
          class="ext:flex ext:items-start ext:gap-2"
        >
          <input
            type="radio"
            name="forms-access"
            class="ext:mt-1 ext:size-4 ext:accent-role-primary"
            :checked="form.settings.access === option.value"
            :disabled="busy"
            @change="changeAccess(option.value)"
          />
          <span>
            <span class="ext:block">{{ option.label }}</span>
            <span class="ext:block ext:text-sm">{{ option.description }}</span>
          </span>
        </label>
      </fieldset>
      <oc-checkbox
        v-if="form.settings.access === 'authenticated'"
        id="forms-collect-identity"
        v-model="form.settings.collectIdentity"
        :label="$gettext('Record the name of each respondent')"
      />
    </section>

    <section :class="card">
      <label for="forms-spreadsheet-language" class="ext:font-semibold">
        {{ $gettext('Spreadsheet language') }}
      </label>
      <select
        id="forms-spreadsheet-language"
        v-model="form.settings.spreadsheetLanguage"
        class="ext:rounded ext:border ext:border-role-outline-variant ext:bg-role-surface ext:p-2"
        aria-describedby="forms-spreadsheet-language-help"
      >
        <option value="fr">Français</option>
        <option value="es">Español</option>
        <option value="de">Deutsch</option>
        <option value="en">English</option>
      </select>
      <p id="forms-spreadsheet-language-help" class="ext:text-sm">
        {{
          $gettext(
            'System headers and Yes/No answers use this language. Update the spreadsheet to apply changes.'
          )
        }}
      </p>
    </section>

    <section :class="card">
      <h2 class="ext:text-lg ext:font-semibold">{{ $gettext('After submitting') }}</h2>
      <oc-textarea
        id="forms-confirmation"
        v-model="form.settings.confirmationMessage"
        :label="$gettext('Confirmation message')"
        :description-message="$gettext('Leave empty for the default message.')"
      />
      <oc-text-input
        id="forms-submit-label"
        v-model="form.settings.submitLabel"
        :label="$gettext('Submit button text')"
      />
    </section>

    <section :class="card">
      <h2 class="ext:text-lg ext:font-semibold">{{ $gettext('Appearance') }}</h2>
      <div class="ext:flex ext:flex-wrap ext:items-center ext:gap-3">
        <label for="forms-accent">{{ $gettext('Accent color') }}</label>
        <input
          id="forms-accent"
          type="color"
          :value="form.settings.accentColor || '#00677f'"
          @input="form.settings.accentColor = ($event.target as HTMLInputElement).value"
        />
        <oc-button
          v-if="form.settings.accentColor"
          appearance="raw"
          size="small"
          @click="form.settings.accentColor = ''"
        >
          {{ $gettext('Use the theme color') }}
        </oc-button>
      </div>
      <div class="ext:flex ext:flex-wrap ext:items-center ext:gap-3">
        <label for="forms-background-color">{{ $gettext('Background color') }}</label>
        <input
          id="forms-background-color"
          type="color"
          :value="form.settings.backgroundColor || '#f6f8fa'"
          @input="form.settings.backgroundColor = ($event.target as HTMLInputElement).value"
        />
        <oc-button
          v-if="form.settings.backgroundColor"
          appearance="raw"
          size="small"
          @click="form.settings.backgroundColor = ''"
        >
          {{ $gettext('Use the default background') }}
        </oc-button>
      </div>
      <div class="ext:flex ext:flex-col ext:gap-2">
        <label for="forms-background-image" class="ext:font-medium">
          {{ $gettext('Background image') }}
        </label>
        <input
          id="forms-background-image"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          @change="selectBackground"
        />
        <p class="ext:text-sm">
          {{ $gettext('PNG, JPEG or WebP, up to 1 MB. The image is embedded in the form.') }}
        </p>
        <oc-button
          v-if="form.settings.backgroundImage"
          appearance="outline"
          class="ext:self-start"
          @click="form.settings.backgroundImage = ''"
        >
          {{ $gettext('Remove background image') }}
        </oc-button>
      </div>
      <div
        class="ext:min-h-40 ext:rounded-xl ext:border ext:border-role-outline-variant ext:bg-cover ext:bg-center ext:p-5"
        :style="appearancePreviewStyle"
      >
        <div
          class="ext:mx-auto ext:max-w-md ext:rounded-xl ext:border ext:border-role-outline-variant ext:bg-role-surface ext:p-4 ext:shadow-sm"
          :style="{ borderTop: `6px solid ${form.settings.accentColor || '#00677f'}` }"
        >
          <strong>{{ form.title || $gettext('Untitled form') }}</strong>
          <p class="ext:mt-1 ext:text-sm">{{ $gettext('Public form preview') }}</p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useGettext } from 'vue3-gettext'
import { useMessages, useModals } from '@opencloud-eu/web-pkg'
import type { Resource, SpaceResource } from '@opencloud-eu/web-client'
import CopyField from './CopyField.vue'
import { usePublication, useFormsApi } from '../composables'
import { MAX_BACKGROUND_IMAGE_BYTES, type FormDefinition } from '../schema'

const { space, resource, isReadOnly } = defineProps<{
  space: SpaceResource
  resource: Resource
  isReadOnly: boolean
}>()
const form = defineModel<FormDefinition>('form', { required: true })
const emit = defineEmits<{ save: [] }>()

const card =
  'ext:flex ext:flex-col ext:gap-3 ext:rounded-lg ext:border ext:border-role-outline-variant ext:bg-role-surface ext:p-4'

const { $gettext } = useGettext()
const { showMessage, showErrorMessage } = useMessages()
const { dispatchModal } = useModals()
const api = useFormsApi()
const publication = usePublication()
const busy = ref(false)

const appearancePreviewStyle = computed(() => ({
  backgroundColor: form.value.settings.backgroundColor || '#f6f8fa',
  backgroundImage: form.value.settings.backgroundImage
    ? `linear-gradient(#ffffff30, #ffffff30), url("${form.value.settings.backgroundImage}")`
    : undefined
}))

function selectBackground(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    showErrorMessage({ title: $gettext('Choose a PNG, JPEG or WebP image') })
    return
  }
  if (file.size > MAX_BACKGROUND_IMAGE_BYTES) {
    showErrorMessage({ title: $gettext('The background image must not exceed 1 MB') })
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    if (typeof reader.result === 'string') form.value.settings.backgroundImage = reader.result
  }
  reader.onerror = () => showErrorMessage({ title: $gettext('The image could not be read') })
  reader.readAsDataURL(file)
}

const accessOptions = computed(() => [
  {
    value: 'authenticated' as const,
    label: $gettext('People with access in OpenCloud'),
    description: $gettext('Users and groups this form is shared with, signed in to OpenCloud.')
  },
  {
    value: 'public' as const,
    label: $gettext('Anyone with the link'),
    description: $gettext('No OpenCloud account needed. The link does not give access to any file.')
  }
])

const publicLinkNeedsRepair = computed(
  () =>
    form.value.settings.access === 'public' &&
    (!form.value.publication?.publicToken || !!form.value.publication.links.view)
)
const publicLinkReady = computed(
  () =>
    form.value.settings.access === 'public' &&
    !!form.value.publication?.publicToken &&
    !form.value.publication.links.view
)

const respondLink = computed(() => {
  if (form.value.settings.access === 'public') {
    return form.value.publication?.publicToken
      ? api.publicUrl(form.value.publication.publicToken)
      : ''
  }
  return api.privateUrl(resource.fileId)
})

const emailLink = computed(() => {
  const subject = $gettext('Questionnaire: %{title}', {
    title: form.value.title || $gettext('Untitled form')
  })
  const body = $gettext('You can answer this questionnaire here: %{link}', {
    link: respondLink.value
  })
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
})

async function update(change: () => unknown | Promise<unknown>, success?: string) {
  busy.value = true
  try {
    await change()
    emit('save')
    success && showMessage({ title: success })
  } catch (e) {
    console.error(e)
    showErrorMessage({ title: $gettext('The publication could not be updated'), errors: [e] })
  } finally {
    busy.value = false
  }
}

function publish() {
  return update(async () => {
    form.value.settings.acceptingResponses = true
    form.value.publication = await publication.publish(
      space,
      resource,
      form.value.settings.access,
      form.value
    )
  }, $gettext('The form is published'))
}

function publishPublic() {
  form.value.settings.access = 'public'
  return publish()
}

function ensurePublicLink() {
  const current = form.value.publication
  if (!current || (current.publicToken && !current.links.view)) {
    return
  }
  return update(async () => {
    await publication.enablePublicLink(current, form.value)
    form.value.settings.access = 'public'
  }, $gettext('The anonymous link is ready'))
}

function changeAccess(access: 'authenticated' | 'public') {
  const current = form.value.publication
  if (!current) {
    form.value.settings.access = access
    return
  }
  return update(async () => {
    if (access === 'public' && !current.publicToken) {
      await publication.enablePublicLink(current, form.value)
    }
    if (access === 'authenticated' && current.publicToken) {
      await publication.disablePublicLink(current, form.value)
    }
    form.value.settings.access = access
  })
}

function confirmRevoke() {
  dispatchModal({
    title: $gettext('Stop publishing this form?'),
    message: $gettext(
      'Nobody will be able to respond and the links used by Forms are deleted. Existing responses are kept in the responses folder.'
    ),
    confirmText: $gettext('Stop publishing'),
    onConfirm: () =>
      update(async () => {
        await publication.revoke(form.value.publication)
        form.value.fields.forEach((field) => delete field.destinationFolderId)
        form.value.publication = null
        form.value.settings.acceptingResponses = false
      })
  })
}

onMounted(() => {
  if (
    !isReadOnly &&
    form.value.publication &&
    form.value.settings.access === 'public' &&
    (!form.value.publication.publicToken || form.value.publication.links.view)
  ) {
    ensurePublicLink()
  }
})
</script>
