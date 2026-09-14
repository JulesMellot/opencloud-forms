<template>
  <article
    class="ext:flex ext:min-h-96 ext:flex-col ext:gap-4 ext:rounded-xl ext:bg-cover ext:bg-center ext:p-3 ext:sm:p-5"
    :style="backgroundStyle"
  >
    <header
      class="ext:rounded-lg ext:border ext:border-t-8 ext:border-role-outline-variant ext:bg-role-surface ext:p-4"
      :style="form.settings.accentColor ? { borderTopColor: form.settings.accentColor } : undefined"
    >
      <h1 class="ext:text-2xl ext:font-semibold ext:break-words">
        {{ form.title || $gettext('Untitled form') }}
      </h1>
      <p v-if="form.description" class="ext:mt-2 ext:whitespace-pre-line ext:break-words">
        {{ form.description }}
      </p>
    </header>

    <p
      v-if="preview"
      class="ext:rounded-lg ext:bg-role-secondary-container ext:p-3 ext:text-role-on-secondary-container"
    >
      {{ $gettext('Preview: answers entered here are checked but never recorded.') }}
    </p>

    <section
      v-if="submitted"
      role="status"
      class="ext:rounded-lg ext:border ext:border-role-outline-variant ext:bg-role-surface ext:p-4"
    >
      <p class="ext:whitespace-pre-line">
        {{ form.settings.confirmationMessage || $gettext('Your response has been recorded.') }}
      </p>
      <oc-button appearance="outline" class="ext:mt-4" @click="startOver">
        {{ $gettext('Submit another response') }}
      </oc-button>
    </section>

    <p
      v-else-if="!form.settings.acceptingResponses && !preview"
      role="status"
      class="ext:rounded-lg ext:border ext:border-role-outline-variant ext:bg-role-surface ext:p-4"
    >
      {{ $gettext('This form is not accepting responses.') }}
    </p>

    <template v-else>
      <p
        v-if="errorMessage"
        role="alert"
        class="ext:rounded-lg ext:bg-role-error-container ext:p-3 ext:text-role-on-error-container"
      >
        {{ errorMessage }}
      </p>
      <form-renderer
        :key="rendererKey"
        :form="form"
        :submitting="submitting"
        :server-errors="serverErrors"
        @submit="onSubmit"
      />
    </template>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGettext } from 'vue3-gettext'
import { useMessages } from '@opencloud-eu/web-pkg'
import FormRenderer from './FormRenderer.vue'
import { requestError, type Submission } from '../composables'
import type { Answers, RespondentForm, ValidationError } from '../schema'

const props = defineProps<{
  form: RespondentForm
  preview?: boolean
  submitFn?: (submission: Submission) => Promise<unknown>
}>()

const { $gettext } = useGettext()
const { showMessage } = useMessages()

// kept across retries so a resent request is recognized as the same response
let submissionId = crypto.randomUUID()
const submitting = ref(false)
const submitted = ref(false)
const serverErrors = ref<Record<string, ValidationError>>({})
const errorMessage = ref('')
const rendererKey = ref(0)

const backgroundStyle = computed(() => ({
  backgroundColor: props.form.settings.backgroundColor || 'transparent',
  backgroundImage: props.form.settings.backgroundImage
    ? `linear-gradient(#ffffff30, #ffffff30), url("${props.form.settings.backgroundImage}")`
    : undefined
}))

function messageFor(status: number, code: string) {
  switch (status) {
    case 0:
      return $gettext(
        'The server could not be reached. Your answers are still here, please try again.'
      )
    case 403:
      return code === 'closed'
        ? $gettext('This form is not accepting responses.')
        : $gettext('You are not allowed to respond to this form.')
    case 404:
      return $gettext('This form is no longer available.')
    case 409:
      return $gettext(
        'The form was changed while you were answering. Copy your answers and reload the page.'
      )
    case 413:
      return $gettext('The uploaded files are too large.')
    case 429:
      return $gettext('Too many responses were sent. Please wait a few minutes and try again.')
    case 503:
    case 507:
      return $gettext('Your response could not be stored. Please try again later.')
  }
  return $gettext('Your response could not be sent. Please try again.')
}

async function onSubmit({ answers, files }: { answers: Answers; files: Record<string, File[]> }) {
  if (props.preview) {
    showMessage({ title: $gettext('The answers are valid. Nothing was recorded.') })
    return
  }
  submitting.value = true
  serverErrors.value = {}
  errorMessage.value = ''
  try {
    await props.submitFn({ submissionId, revision: props.form.revision, answers, files })
    submitted.value = true
  } catch (e) {
    const { status, code, fields } = requestError(e)
    if (status === 400 && fields) {
      serverErrors.value = fields
    } else {
      errorMessage.value = messageFor(status, code)
    }
  } finally {
    submitting.value = false
  }
}

function startOver() {
  submissionId = crypto.randomUUID()
  submitted.value = false
  rendererKey.value++
}
</script>
