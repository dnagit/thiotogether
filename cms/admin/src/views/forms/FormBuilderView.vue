<script setup lang="ts">
/** Visual form builder: field palette, drag-sortable field list, per-field options. */
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import draggable from 'vuedraggable';
import { http } from '@/api/http';
import { FormFieldType, type ApiResponse } from '@cms/shared';

const route = useRoute();
const router = useRouter();
const formId = Number(route.params.id);

const formMeta = ref<any | null>(null);
const fields = ref<any[]>([]);
const selectedKey = ref<string | null>(null);
const saving = ref(false);

let keySeq = 0;
const nextKey = () => `fld-${++keySeq}`;

const fieldTypes = Object.values(FormFieldType).map((t) => ({
  type: t,
  label: t.charAt(0) + t.slice(1).toLowerCase(),
  icon: {
    TEXT: '🔤', NUMBER: '🔢', EMAIL: '✉️', PHONE: '📞', DATE: '📅', TIME: '🕐',
    SELECT: '▾', RADIO: '◉', CHECKBOX: '☑', TEXTAREA: '📄', UPLOAD: '📎',
  }[t],
}));

const selected = computed(() => fields.value.find((f) => f._key === selectedKey.value) ?? null);
const hasOptions = computed(() => ['SELECT', 'RADIO', 'CHECKBOX'].includes(selected.value?.type));

async function load(): Promise<void> {
  const { data } = await http.get<ApiResponse<any>>(`/forms/${formId}`);
  formMeta.value = data.data;
  fields.value = (data.data.fields ?? []).map((f: any) => ({ ...f, _key: nextKey() }));
}
void load();

function addField(type: string): void {
  const base = `field_${fields.value.length + 1}`;
  const field = {
    type,
    name: base,
    label: `Field ${fields.value.length + 1}`,
    placeholder: '',
    helpText: '',
    required: false,
    options: [],
    validation: {},
    width: 12,
    _key: nextKey(),
  };
  fields.value.push(field);
  selectedKey.value = field._key;
}

function removeField(key: string): void {
  fields.value = fields.value.filter((f) => f._key !== key);
  if (selectedKey.value === key) selectedKey.value = null;
}

function addOption(): void {
  selected.value.options = [...(selected.value.options ?? []), { label: '', value: '' }];
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    await http.put(`/forms/${formId}/fields`, {
      fields: fields.value.map((f, i) => ({
        id: f.id,
        type: f.type,
        name: f.name,
        label: f.label,
        placeholder: f.placeholder || null,
        helpText: f.helpText || null,
        required: !!f.required,
        options: f.options ?? [],
        validation: f.validation ?? {},
        sortOrder: i,
        width: f.width ?? 12,
      })),
    });
    ElMessage.success('Fields saved');
    await load();
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="builder">
    <div class="builder-toolbar">
      <div>
        <ElButton text @click="router.push({ name: 'forms' })">← Forms</ElButton>
        <b>{{ formMeta?.name }}</b> <code class="text-muted">/{{ formMeta?.slug }}</code>
      </div>
      <ElButton type="primary" :loading="saving" @click="save">Save Fields</ElButton>
    </div>

    <div class="builder-body">
      <div class="palette-col">
        <h4>Add Field</h4>
        <div v-for="ft in fieldTypes" :key="ft.type" class="palette-item" @click="addField(ft.type)">
          <span>{{ ft.icon }}</span> {{ ft.label }}
        </div>
      </div>

      <div class="canvas">
        <draggable v-model="fields" item-key="_key" handle=".drag-handle" animation="150">
          <template #item="{ element }">
            <div class="field-row" :class="{ selected: element._key === selectedKey }" @click="selectedKey = element._key">
              <span class="drag-handle">⠿</span>
              <span class="f-label">{{ element.label }}</span>
              <ElTag size="small">{{ element.type }}</ElTag>
              <ElTag v-if="element.required" size="small" type="danger">required</ElTag>
              <code class="text-muted">{{ element.name }}</code>
              <span class="spacer" />
              <ElButton size="small" text type="danger" @click.stop="removeField(element._key)">✕</ElButton>
            </div>
          </template>
        </draggable>
        <ElEmpty v-if="!fields.length" description="Click a field type on the left to add it" />
      </div>

      <div class="inspector">
        <template v-if="selected">
          <h3>Field Settings</h3>
          <ElForm label-position="top" size="small">
            <ElFormItem label="Label"><ElInput v-model="selected.label" /></ElFormItem>
            <ElFormItem label="Name (data key)">
              <ElInput v-model="selected.name" placeholder="lowercase_with_underscores" />
            </ElFormItem>
            <ElFormItem label="Placeholder"><ElInput v-model="selected.placeholder" /></ElFormItem>
            <ElFormItem label="Help Text"><ElInput v-model="selected.helpText" /></ElFormItem>
            <ElFormItem><ElCheckbox v-model="selected.required">Required</ElCheckbox></ElFormItem>
            <ElFormItem label="Width (12 = full row)">
              <ElSlider v-model="selected.width" :min="3" :max="12" :step="3" show-stops />
            </ElFormItem>

            <template v-if="hasOptions">
              <ElDivider>Options</ElDivider>
              <div v-for="(opt, i) in selected.options" :key="i" class="opt-row">
                <ElInput v-model="opt.label" placeholder="Label" size="small" />
                <ElInput v-model="opt.value" placeholder="value" size="small" />
                <ElButton size="small" text type="danger" @click="selected.options.splice(i, 1)">✕</ElButton>
              </div>
              <ElButton size="small" plain @click="addOption">+ Option</ElButton>
            </template>

            <template v-if="selected.type === 'NUMBER'">
              <ElDivider>Validation</ElDivider>
              <ElFormItem label="Min"><ElInputNumber v-model="selected.validation.min" /></ElFormItem>
              <ElFormItem label="Max"><ElInputNumber v-model="selected.validation.max" /></ElFormItem>
            </template>
            <template v-if="['TEXT', 'TEXTAREA'].includes(selected.type)">
              <ElDivider>Validation</ElDivider>
              <ElFormItem label="Max Length"><ElInputNumber v-model="selected.validation.maxLength" /></ElFormItem>
            </template>
            <template v-if="selected.type === 'UPLOAD'">
              <ElDivider>Upload rules</ElDivider>
              <ElFormItem label="Accept (e.g. image/*)"><ElInput v-model="selected.validation.accept" /></ElFormItem>
              <ElFormItem label="Max Size (MB)"><ElInputNumber v-model="selected.validation.maxSizeMb" /></ElFormItem>
            </template>
          </ElForm>
        </template>
        <ElEmpty v-else description="Select a field" :image-size="80" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.builder { display: flex; flex-direction: column; height: calc(100vh - var(--app-header-height)); }
.builder-toolbar { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; border-bottom: 1px solid var(--el-border-color-light); }
.builder-body { display: flex; flex: 1; min-height: 0; }
.palette-col { width: 180px; border-right: 1px solid var(--el-border-color-light); padding: 12px; overflow-y: auto; }
.palette-item { padding: 8px 10px; border: 1px solid var(--el-border-color-light); border-radius: 6px; margin-bottom: 6px; cursor: pointer; font-size: 13px; }
.palette-item:hover { border-color: var(--el-color-primary); }
.canvas { flex: 1; overflow-y: auto; padding: 16px; }
.inspector { width: 340px; border-left: 1px solid var(--el-border-color-light); padding: 16px; overflow-y: auto; }
.field-row { display: flex; align-items: center; gap: 8px; padding: 10px 12px; margin-bottom: 8px; border: 1px solid var(--el-border-color-light); border-radius: 8px; cursor: pointer; background: var(--el-bg-color); }
.field-row.selected { border-color: var(--el-color-primary); box-shadow: 0 0 0 1px var(--el-color-primary); }
.f-label { font-weight: 600; }
.spacer { flex: 1; }
.drag-handle { cursor: grab; color: var(--el-text-color-secondary); }
.opt-row { display: flex; gap: 6px; margin-bottom: 6px; }
</style>
