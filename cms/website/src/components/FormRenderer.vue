<script setup lang="ts">
/**
 * Dynamic Form Renderer: fetches a form definition by slug and renders its
 * fields (all 11 field types), validates client-side, submits to the public
 * API. Used by the ContactFormBlock and reusable for any CMS-built form.
 */
import { computed, reactive, ref } from 'vue';
import { get, post } from '@/api/client';
import type { Form, FormField } from '@cms/shared';

const props = defineProps<{ slug: string }>();
const emit = defineEmits<{ submitted: [] }>();

const form = ref<Form | null>(null);
const values = reactive<Record<string, any>>({});
const errors = reactive<Record<string, string>>({});
const loading = ref(true);
const submitting = ref(false);
const done = ref(false);
const successMessage = ref('');
const loadFailed = ref(false);

void get<Form>(`/forms/${props.slug}`)
  .then((f) => {
    form.value = f;
    for (const field of f.fields ?? []) {
      values[field.name] = field.type === 'CHECKBOX' ? [] : '';
    }
  })
  .catch(() => (loadFailed.value = true))
  .finally(() => (loading.value = false));

const fields = computed(() => form.value?.fields ?? []);

function validate(): boolean {
  for (const key of Object.keys(errors)) delete errors[key];
  for (const field of fields.value) {
    const value = values[field.name];
    const empty =
      value === '' || value === null || value === undefined || (Array.isArray(value) && !value.length);
    if (field.required && empty) {
      errors[field.name] = `${field.label} is required`;
      continue;
    }
    if (empty) continue;
    if (field.type === 'EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
      errors[field.name] = 'Invalid email address';
    }
    if (field.type === 'PHONE' && !/^[0-9+\-() ]{6,20}$/.test(String(value))) {
      errors[field.name] = 'Invalid phone number';
    }
  }
  return Object.keys(errors).length === 0;
}

async function submit(): Promise<void> {
  if (!validate()) return;
  submitting.value = true;
  try {
    const res = await post<{ successMessage: string }>(`/forms/${props.slug}/submit`, { data: { ...values } });
    successMessage.value = res.data.successMessage;
    done.value = true;
    emit('submitted');
  } catch (err: any) {
    for (const e of err?.response?.data?.errors ?? []) errors[e.field] = e.message;
  } finally {
    submitting.value = false;
  }
}

function widthClass(field: FormField): string {
  const w = field.width ?? 12;
  if (w <= 3) return 'md:col-span-3';
  if (w <= 6) return 'md:col-span-6';
  if (w <= 9) return 'md:col-span-9';
  return 'md:col-span-12';
}

const inputClass =
  'w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:border-transparent';
</script>

<template>
  <div v-if="loading" class="py-8 text-center text-gray-400 animate-pulse">Loading form…</div>
  <div v-else-if="loadFailed" class="py-8 text-center text-gray-400">Form unavailable.</div>

  <div v-else-if="done" class="py-12 text-center">
    <div class="text-5xl mb-4">✅</div>
    <p class="text-lg font-medium">{{ successMessage }}</p>
  </div>

  <form v-else-if="form" class="grid grid-cols-1 md:grid-cols-12 gap-4" novalidate @submit.prevent="submit">
    <div v-for="field in fields" :key="field.id" class="col-span-1" :class="widthClass(field)">
      <label class="block text-sm font-medium mb-1.5">
        {{ field.label }} <span v-if="field.required" class="text-red-500">*</span>
      </label>

      <textarea
        v-if="field.type === 'TEXTAREA'"
        v-model="values[field.name]"
        :placeholder="field.placeholder ?? ''"
        rows="4"
        :class="inputClass"
        :style="{ '--tw-ring-color': 'var(--color-primary)' }"
      />

      <select
        v-else-if="field.type === 'SELECT'"
        v-model="values[field.name]"
        :class="inputClass"
        :style="{ '--tw-ring-color': 'var(--color-primary)' }"
      >
        <option value="" disabled>{{ field.placeholder || 'Select…' }}</option>
        <option v-for="opt in field.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>

      <div v-else-if="field.type === 'RADIO'" class="space-y-1.5 pt-1">
        <label v-for="opt in field.options" :key="opt.value" class="flex items-center gap-2 text-sm">
          <input v-model="values[field.name]" type="radio" :value="opt.value" :name="field.name" />
          {{ opt.label }}
        </label>
      </div>

      <div v-else-if="field.type === 'CHECKBOX'" class="space-y-1.5 pt-1">
        <label v-for="opt in field.options" :key="opt.value" class="flex items-center gap-2 text-sm">
          <input v-model="values[field.name]" type="checkbox" :value="opt.value" />
          {{ opt.label }}
        </label>
      </div>

      <input
        v-else
        v-model="values[field.name]"
        :type="{ TEXT: 'text', NUMBER: 'number', EMAIL: 'email', PHONE: 'tel', DATE: 'date', TIME: 'time', UPLOAD: 'file' }[field.type] ?? 'text'"
        :placeholder="field.placeholder ?? ''"
        :class="inputClass"
        :style="{ '--tw-ring-color': 'var(--color-primary)' }"
      />

      <p v-if="field.helpText" class="text-xs text-gray-500 mt-1">{{ field.helpText }}</p>
      <p v-if="errors[field.name]" class="text-xs text-red-600 mt-1">{{ errors[field.name] }}</p>
    </div>

    <div class="col-span-1 md:col-span-12">
      <button type="submit" class="btn-primary" :disabled="submitting">
        {{ submitting ? 'Sending…' : form.submitLabel }}
      </button>
    </div>
  </form>
</template>
