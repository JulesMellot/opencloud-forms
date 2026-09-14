<template>
  <main
    class="ext:size-full ext:overflow-y-auto ext:bg-role-surface-container ext:text-role-on-surface"
  >
    <div class="ext:mx-auto ext:max-w-2xl ext:px-3 ext:py-6 ext:sm:px-6">
      <div v-if="loading" class="ext:flex ext:justify-center ext:p-8">
        <oc-spinner :aria-label="$gettext('Loading form')" size="large" />
      </div>
      <p
        v-else-if="loadError"
        role="alert"
        class="ext:rounded-lg ext:border ext:border-role-outline-variant ext:bg-role-surface ext:p-4"
      >
        {{ loadError }}
      </p>
      <respond-view v-else-if="form" :form="form" :submit-fn="submit" />
    </div>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref, unref } from 'vue'
import { useGettext } from 'vue3-gettext'
import { useRouteParam } from '@opencloud-eu/web-pkg'
import RespondView from '../components/RespondView.vue'
import { requestError, useFormsApi, type Submission } from '../composables'
import type { RespondentForm } from '../schema'

const { $gettext } = useGettext()
const api = useFormsApi()
const token = useRouteParam('token')

const form = ref<RespondentForm>()
const loading = ref(true)
const loadError = ref('')

onMounted(async () => {
  try {
    form.value = await api.getPublicForm(unref(token))
    document.title = form.value.title || document.title
  } catch (e) {
    const { status } = requestError(e)
    loadError.value =
      status === 404
        ? $gettext('This form does not exist or is no longer available.')
        : status === 429
          ? $gettext('Too many requests. Please wait a moment and reload the page.')
          : $gettext('The form could not be loaded. Please try again later.')
  } finally {
    loading.value = false
  }
})

function submit(submission: Submission) {
  return api.submitPublic(unref(token), submission)
}
</script>
