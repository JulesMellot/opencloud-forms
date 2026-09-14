<template>
  <div class="ext:flex ext:flex-col ext:gap-4">
    <section
      class="ext:flex ext:flex-col ext:gap-3 ext:rounded-lg ext:border ext:border-t-8 ext:border-role-outline-variant ext:bg-role-surface ext:p-4"
      :style="form.settings.accentColor ? { borderTopColor: form.settings.accentColor } : undefined"
    >
      <div class="ext:flex ext:flex-wrap ext:items-end ext:gap-2">
        <oc-text-input
          id="forms-title"
          v-model="form.title"
          class="ext:min-w-60 ext:flex-1"
          :label="$gettext('Questionnaire name')"
        />
        <oc-button
          appearance="outline"
          :disabled="renaming || !form.title.trim()"
          :show-spinner="renaming"
          @click="emit('rename', form.title)"
        >
          {{ $gettext('Rename the file') }}
        </oc-button>
      </div>
      <p class="ext:text-sm ext:text-role-on-surface-variant">
        {{ $gettext('File: %{name}', { name: fileName || '' }) }}
      </p>
      <oc-textarea
        id="forms-description"
        v-model="form.description"
        :label="$gettext('Description')"
      />
    </section>

    <p v-if="!form.fields.length" class="ext:p-4 ext:text-center">
      {{ $gettext('This form has no questions yet.') }}
    </p>

    <field-editor
      v-for="(field, index) in form.fields"
      :key="field.id"
      v-model:field="form.fields[index]"
      :index="index"
      :count="form.fields.length"
      @move="(direction) => move(index, direction)"
      @duplicate="duplicate(index)"
      @remove="remove(index)"
      @choose-destination="emit('chooseDestination', field)"
      @clear-destination="emit('clearDestination', field)"
    />

    <div
      class="ext:flex ext:flex-wrap ext:items-end ext:gap-2 ext:rounded-lg ext:border ext:border-dashed ext:border-role-outline-variant ext:p-4"
    >
      <oc-select
        id="forms-new-question-type"
        v-model="newType"
        class="ext:min-w-60"
        :options="types"
        option-label="label"
        :label="$gettext('New question type')"
        :clearable="false"
      />
      <oc-button appearance="filled" @click="add">
        <oc-icon name="add" size="small" />
        {{ $gettext('Add question') }}
      </oc-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useGettext } from 'vue3-gettext'
import { useModals } from '@opencloud-eu/web-pkg'
import FieldEditor from './FieldEditor.vue'
import { useFieldTypes } from '../composables'
import { createField, newId, type FormDefinition, type FormField } from '../schema'

defineProps<{ fileName?: string; renaming?: boolean }>()
const form = defineModel<FormDefinition>('form', { required: true })
const emit = defineEmits<{
  rename: [title: string]
  chooseDestination: [field: FormField]
  clearDestination: [field: FormField]
}>()

const { $gettext } = useGettext()
const { dispatchModal } = useModals()
const { types } = useFieldTypes()
const newType = ref(types[0])

async function add() {
  const field = createField(newType.value.value)
  form.value.fields.push(field)
  await nextTick()
  document.getElementById(`forms-edit-${field.id}-label`)?.focus()
}

function move(index: number, direction: -1 | 1) {
  const fields = form.value.fields
  ;[fields[index], fields[index + direction]] = [fields[index + direction], fields[index]]
}

function duplicate(index: number) {
  const copy: FormField = JSON.parse(JSON.stringify(form.value.fields[index]))
  copy.id = newId('fld')
  copy.options = copy.options?.map((option) => ({ ...option, id: newId('opt') }))
  // the upload link belongs to the original question
  delete copy.destinationFolderId
  form.value.fields.splice(index + 1, 0, copy)
}

function remove(index: number) {
  const field = form.value.fields[index]
  dispatchModal({
    title: $gettext('Delete this question?'),
    message: $gettext('Existing answers to this question stay readable in the responses.'),
    confirmText: $gettext('Delete'),
    onConfirm: () => {
      form.value.fields.splice(form.value.fields.indexOf(field), 1)
      form.value.archivedFields = [
        ...form.value.archivedFields.filter(({ id }) => id !== field.id),
        field
      ]
    }
  })
}
</script>
