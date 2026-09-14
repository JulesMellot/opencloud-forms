<template>
  <section
    class="ext:flex ext:flex-col ext:gap-3 ext:rounded-lg ext:border ext:border-role-outline-variant ext:bg-role-surface ext:p-4"
    :aria-label="$gettext('Question %{number}', { number: String(index + 1) })"
  >
    <div class="ext:flex ext:flex-wrap ext:items-start ext:gap-3">
      <oc-text-input
        :id="`${prefix}-label`"
        v-model="field.label"
        class="ext:min-w-60 ext:flex-1"
        :label="$gettext('Question')"
      />
      <oc-select
        :id="`${prefix}-type`"
        class="ext:w-full ext:sm:w-56"
        :model-value="types.find((t) => t.value === field.type)"
        :options="types"
        option-label="label"
        :label="$gettext('Answer type')"
        :clearable="false"
        @update:model-value="changeType"
      />
    </div>
    <oc-text-input
      :id="`${prefix}-description`"
      v-model="field.description"
      :label="$gettext('Help text')"
    />
    <oc-text-input
      v-if="['text', 'textarea', 'email', 'url', 'number'].includes(field.type)"
      :id="`${prefix}-placeholder`"
      v-model="field.placeholder"
      :label="$gettext('Placeholder')"
    />

    <fieldset v-if="isChoiceType(field.type)" class="ext:flex ext:flex-col ext:gap-2">
      <legend class="ext:mb-1 ext:font-semibold">{{ $gettext('Options') }}</legend>
      <div
        v-for="(option, i) in field.options"
        :key="option.id"
        class="ext:flex ext:items-end ext:gap-2"
      >
        <oc-text-input
          :id="`${prefix}-${option.id}`"
          v-model="option.label"
          class="ext:flex-1"
          :label="$gettext('Option %{number}', { number: String(i + 1) })"
        />
        <oc-button
          appearance="raw"
          :aria-label="$gettext('Remove option %{number}', { number: String(i + 1) })"
          :disabled="field.options.length === 1"
          @click="field.options.splice(i, 1)"
        >
          <oc-icon name="delete-bin" />
        </oc-button>
      </div>
      <oc-button
        appearance="outline"
        size="small"
        class="ext:self-start"
        @click="field.options.push({ id: newId('opt'), label: '' })"
      >
        <oc-icon name="add" size="small" />
        {{ $gettext('Add option') }}
      </oc-button>
    </fieldset>

    <div class="ext:grid ext:grid-cols-1 ext:gap-3 ext:sm:grid-cols-2">
      <template v-for="limit in limits" :key="limit.key">
        <oc-text-input
          :id="`${prefix}-${limit.key}`"
          type="number"
          :model-value="field[limit.key] === undefined ? '' : String(field[limit.key])"
          :label="limit.label"
          @update:model-value="(value: string) => setLimit(limit.key, value)"
        />
      </template>
    </div>

    <template v-if="field.type === 'file'">
      <fieldset class="ext:flex ext:flex-wrap ext:gap-x-4 ext:gap-y-2">
        <legend class="ext:mb-1 ext:font-semibold">{{ $gettext('Accepted files') }}</legend>
        <oc-checkbox
          v-for="category in categories"
          :id="`${prefix}-accept-${category.value}`"
          :key="category.value"
          :model-value="(field.accept || []).includes(category.value)"
          :label="category.label"
          @update:model-value="(checked: boolean) => toggleCategory(category.value, checked)"
        />
      </fieldset>
      <div class="ext:flex ext:flex-wrap ext:items-center ext:gap-2">
        <span>
          {{ $gettext('Uploaded files go to:') }}
          <strong>{{
            field.destinationFolderId
              ? $gettext('a chosen folder')
              : $gettext('the responses folder')
          }}</strong>
        </span>
        <oc-button appearance="outline" size="small" @click="emit('chooseDestination')">
          <oc-icon name="folder" size="small" />
          {{ $gettext('Choose folder') }}
        </oc-button>
        <oc-button
          v-if="field.destinationFolderId"
          appearance="raw"
          size="small"
          @click="emit('clearDestination')"
        >
          {{ $gettext('Use the responses folder') }}
        </oc-button>
      </div>
    </template>

    <div
      class="ext:flex ext:flex-wrap ext:items-center ext:justify-between ext:gap-2 ext:border-t ext:border-role-outline-variant ext:pt-3"
    >
      <oc-checkbox
        :id="`${prefix}-required`"
        v-model="field.required"
        :label="$gettext('Required')"
      />
      <div class="ext:flex ext:gap-1">
        <oc-button
          appearance="raw"
          :aria-label="$gettext('Move up')"
          :disabled="index === 0"
          @click="emit('move', -1)"
        >
          <oc-icon name="arrow-up" />
        </oc-button>
        <oc-button
          appearance="raw"
          :aria-label="$gettext('Move down')"
          :disabled="index === count - 1"
          @click="emit('move', 1)"
        >
          <oc-icon name="arrow-down" />
        </oc-button>
        <oc-button
          appearance="raw"
          :aria-label="$gettext('Duplicate question')"
          @click="emit('duplicate')"
        >
          <oc-icon name="file-copy" />
        </oc-button>
        <oc-button
          appearance="raw"
          :aria-label="$gettext('Delete question')"
          @click="emit('remove')"
        >
          <oc-icon name="delete-bin" />
        </oc-button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useGettext } from 'vue3-gettext'
import { useFieldTypes } from '../composables'
import {
  DEFAULT_MAX_SIZE_MB,
  isChoiceType,
  newId,
  type FieldType,
  type FileCategory,
  type FormField
} from '../schema'

type LimitKey = 'minLength' | 'maxLength' | 'min' | 'max' | 'maxChoices' | 'maxSizeMb' | 'maxFiles'

const { index, count } = defineProps<{ index: number; count: number }>()
const field = defineModel<FormField>('field', { required: true })
const emit = defineEmits<{
  move: [direction: -1 | 1]
  duplicate: []
  remove: []
  chooseDestination: []
  clearDestination: []
}>()

const { $gettext } = useGettext()
const { types, categories } = useFieldTypes()
const prefix = computed(() => `forms-edit-${field.value.id}`)

const limits = computed((): { key: LimitKey; label: string }[] => {
  switch (field.value.type) {
    case 'text':
    case 'textarea':
      return [
        { key: 'minLength', label: $gettext('Minimum length') },
        { key: 'maxLength', label: $gettext('Maximum length') }
      ]
    case 'number':
      return [
        { key: 'min', label: $gettext('Minimum value') },
        { key: 'max', label: $gettext('Maximum value') }
      ]
    case 'checkbox':
      return [{ key: 'maxChoices', label: $gettext('Maximum number of choices') }]
    case 'file':
      return [
        { key: 'maxSizeMb', label: $gettext('Maximum size per file (MB)') },
        { key: 'maxFiles', label: $gettext('Maximum number of files') }
      ]
  }
  return []
})

function setLimit(key: LimitKey, value: string) {
  const number = Number(value)
  if (value === '' || !Number.isFinite(number)) {
    delete field.value[key]
  } else {
    field.value[key] = number
  }
}

function changeType(option: { value: FieldType }) {
  field.value.type = option.value
  if (isChoiceType(option.value) && !field.value.options?.length) {
    field.value.options = [{ id: newId('opt'), label: '' }]
  }
  if (option.value === 'file' && !field.value.accept) {
    field.value.accept = ['any']
    field.value.maxSizeMb = DEFAULT_MAX_SIZE_MB
    field.value.maxFiles = 1
  }
}

function toggleCategory(category: FileCategory, checked: boolean) {
  const current = (field.value.accept || []).filter((c) => c !== category)
  field.value.accept = checked ? [...current, category] : current
}
</script>
