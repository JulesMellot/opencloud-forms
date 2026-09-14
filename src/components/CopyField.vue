<template>
  <div class="ext:flex ext:items-end ext:gap-2">
    <oc-text-input :id="id" class="ext:flex-1" :model-value="value" :label="label" read-only />
    <oc-button
      appearance="outline"
      :aria-label="$gettext('Copy %{label}', { label })"
      @click="copy"
    >
      <oc-icon name="file-copy" size="small" />
      {{ $gettext('Copy') }}
    </oc-button>
  </div>
</template>

<script setup lang="ts">
import { useId } from 'vue'
import { useGettext } from 'vue3-gettext'
import { useMessages } from '@opencloud-eu/web-pkg'

const { label, value } = defineProps<{ label: string; value: string }>()

const id = useId()
const { $gettext } = useGettext()
const { showMessage, showErrorMessage } = useMessages()

async function copy() {
  try {
    await navigator.clipboard.writeText(value)
    showMessage({ title: $gettext('Link copied') })
  } catch (e) {
    showErrorMessage({ title: $gettext('The link could not be copied'), errors: [e] })
  }
}
</script>
