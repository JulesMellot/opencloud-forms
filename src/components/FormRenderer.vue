<template>
  <form class="ext:flex ext:flex-col ext:gap-4" novalidate @submit.prevent="submit">
    <section
      v-for="field in form.fields"
      :key="field.id"
      :data-field-id="field.id"
      class="ext:rounded-lg ext:border ext:border-role-outline-variant ext:bg-role-surface ext:p-4"
    >
      <oc-text-input
        v-if="textInputTypes[field.type]"
        :id="inputId(field)"
        :type="textInputTypes[field.type]"
        :model-value="stringValue(field)"
        :label="field.label || $gettext('Untitled question')"
        :placeholder="field.placeholder"
        :required-mark="field.required"
        :description-message="field.description || undefined"
        :error-message="errorText(field)"
        :disabled="disabled"
        @update:model-value="(value: string) => (answers[field.id] = value)"
      />
      <oc-textarea
        v-else-if="field.type === 'textarea'"
        :id="inputId(field)"
        :model-value="stringValue(field)"
        :label="field.label || $gettext('Untitled question')"
        :placeholder="field.placeholder"
        :description-message="field.description || undefined"
        :error-message="errorText(field)"
        :disabled="disabled"
        @update:model-value="(value: string) => (answers[field.id] = value)"
      />
      <oc-select
        v-else-if="field.type === 'select'"
        :id="inputId(field)"
        :model-value="field.options?.find((o) => o.id === answers[field.id]) ?? null"
        :options="field.options"
        option-label="label"
        :label="field.label || $gettext('Untitled question')"
        :clearable="!field.required"
        :description-message="field.description || undefined"
        :error-message="errorText(field)"
        :disabled="disabled"
        @update:model-value="(option: FieldOption | null) => (answers[field.id] = option?.id ?? '')"
      />
      <fieldset
        v-else-if="['radio', 'checkbox', 'boolean'].includes(field.type)"
        :aria-describedby="describedBy(field)"
        :aria-invalid="!!errors[field.id]"
      >
        <legend class="ext:mb-2 ext:font-semibold">
          {{ field.label || $gettext('Untitled question') }}
          <span v-if="field.required" aria-hidden="true">*</span>
        </legend>
        <p
          v-if="field.description"
          :id="`${inputId(field)}-description`"
          class="ext:mb-2 ext:text-sm"
        >
          {{ field.description }}
        </p>
        <div class="ext:flex ext:flex-col ext:gap-2">
          <template v-if="field.type === 'checkbox'">
            <oc-checkbox
              v-for="option in field.options"
              :id="`${inputId(field)}-${option.id}`"
              :key="option.id"
              :model-value="selected(field).includes(option.id)"
              :label="option.label"
              :disabled="disabled"
              @update:model-value="(checked: boolean) => toggle(field, option.id, checked)"
            />
          </template>
          <label
            v-for="option in singleChoices(field)"
            v-else
            :key="String(option.value)"
            class="ext:flex ext:items-center ext:gap-2"
          >
            <input
              type="radio"
              :name="inputId(field)"
              :checked="answers[field.id] === option.value"
              :disabled="disabled"
              class="ext:size-4 ext:accent-role-primary"
              @change="answers[field.id] = option.value"
            />
            {{ option.label }}
          </label>
        </div>
      </fieldset>
      <div v-else-if="field.type === 'time' || field.type === 'file'">
        <label :for="inputId(field)" class="ext:mb-1 ext:block ext:font-semibold">
          {{ field.label || $gettext('Untitled question') }}
          <span v-if="field.required" aria-hidden="true">*</span>
        </label>
        <p
          v-if="field.description"
          :id="`${inputId(field)}-description`"
          class="ext:mb-2 ext:text-sm"
        >
          {{ field.description }}
        </p>
        <input
          v-if="field.type === 'time'"
          :id="inputId(field)"
          type="time"
          :value="stringValue(field)"
          :disabled="disabled"
          :aria-describedby="describedBy(field)"
          :aria-invalid="!!errors[field.id]"
          class="ext:rounded ext:border ext:border-role-outline ext:bg-role-surface ext:px-2 ext:py-1"
          @input="answers[field.id] = ($event.target as HTMLInputElement).value"
        />
        <template v-else>
          <input
            :id="inputId(field)"
            type="file"
            :multiple="(field.maxFiles ?? 1) > 1"
            :accept="acceptFor(field)"
            :disabled="disabled"
            :aria-describedby="describedBy(field)"
            :aria-invalid="!!errors[field.id]"
            class="ext:block ext:max-w-full"
            @change="addFiles(field, $event)"
          />
          <ul v-if="files[field.id]?.length" class="ext:mt-2 ext:flex ext:flex-col ext:gap-1">
            <li
              v-for="(file, index) in files[field.id]"
              :key="`${file.name}-${index}`"
              class="ext:flex ext:items-center ext:gap-2 ext:text-sm"
            >
              <span class="ext:truncate">{{ file.name }}</span>
              <oc-button
                appearance="raw"
                :aria-label="$gettext('Remove %{name}', { name: file.name })"
                :disabled="disabled"
                @click="files[field.id].splice(index, 1)"
              >
                <oc-icon name="close" size="small" />
              </oc-button>
            </li>
          </ul>
        </template>
      </div>
      <p
        v-if="errors[field.id] && !ownsErrorMessage(field)"
        :id="`${inputId(field)}-error`"
        class="ext:mt-2 ext:text-sm ext:text-role-error"
      >
        {{ errorText(field) }}
      </p>
    </section>

    <div class="ext:flex ext:justify-end">
      <oc-button
        submit="submit"
        appearance="filled"
        :disabled="disabled || submitting"
        :show-spinner="submitting"
      >
        {{ form.settings.submitLabel || $gettext('Submit') }}
      </oc-button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, toRaw } from 'vue'
import { useGettext } from 'vue3-gettext'
import { useValidationMessages } from '../composables'
import {
  acceptAttribute,
  validateSubmission,
  type AnswerValue,
  type Answers,
  type FieldOption,
  type FormField,
  type RespondentForm,
  type ValidationError
} from '../schema'

const props = defineProps<{
  form: RespondentForm
  disabled?: boolean
  submitting?: boolean
  serverErrors?: Record<string, ValidationError>
}>()

const emit = defineEmits<{
  submit: [payload: { answers: Answers; files: Record<string, File[]> }]
}>()

const { $gettext } = useGettext()
const validationMessage = useValidationMessages()

const answers = reactive<Record<string, AnswerValue>>({})
const files = reactive<Record<string, File[]>>({})
const localErrors = ref<Record<string, ValidationError>>({})
const errors = computed(() => ({ ...localErrors.value, ...props.serverErrors }))

const textInputTypes: Partial<Record<FormField['type'], 'text' | 'number' | 'email' | 'date'>> = {
  text: 'text',
  url: 'text',
  email: 'email',
  number: 'number',
  date: 'date'
}

function inputId(field: FormField) {
  return `forms-${field.id}`
}

function stringValue(field: FormField) {
  const value = answers[field.id]
  return value === undefined ? '' : String(value)
}

function selected(field: FormField) {
  const value = answers[field.id]
  return Array.isArray(value) ? value : []
}

function toggle(field: FormField, optionId: string, checked: boolean) {
  const values = selected(field).filter((id) => id !== optionId)
  answers[field.id] = checked ? [...values, optionId] : values
}

function singleChoices(field: FormField) {
  if (field.type === 'boolean') {
    return [
      { value: true, label: $gettext('Yes') },
      { value: false, label: $gettext('No') }
    ]
  }
  return (field.options || []).map(({ id, label }) => ({ value: id, label }))
}

function acceptFor(field: FormField) {
  const categories = field.accept?.length ? field.accept : ['any' as const]
  return categories.includes('any')
    ? undefined
    : categories.map((c) => acceptAttribute[c]).join(',')
}

function addFiles(field: FormField, event: Event) {
  const input = event.target as HTMLInputElement
  files[field.id] = [...(files[field.id] || []), ...Array.from(input.files || [])]
  input.value = ''
}

/** Design-system inputs render their own error message */
function ownsErrorMessage(field: FormField) {
  return !!textInputTypes[field.type] || field.type === 'textarea' || field.type === 'select'
}

function describedBy(field: FormField) {
  const ids = [
    field.description && `${inputId(field)}-description`,
    errors.value[field.id] && `${inputId(field)}-error`
  ]
  return ids.filter(Boolean).join(' ') || undefined
}

function errorText(field: FormField) {
  return validationMessage(field, errors.value[field.id])
}

async function submit() {
  const fileMeta = Object.fromEntries(
    Object.entries(files).map(([id, list]) => [id, list.map(({ name, size }) => ({ name, size }))])
  )
  const result = validateSubmission(props.form.fields, toRaw(answers), fileMeta)
  localErrors.value = result.errors
  const firstInvalid = props.form.fields.find((f) => result.errors[f.id])
  if (firstInvalid) {
    await nextTick()
    document
      .querySelector<HTMLElement>(`[data-field-id="${firstInvalid.id}"] :is(input, textarea)`)
      ?.focus()
    return
  }
  emit('submit', {
    answers: result.answers,
    files: Object.fromEntries(
      props.form.fields.filter((f) => f.type === 'file').map((f) => [f.id, files[f.id] || []])
    )
  })
}
</script>
