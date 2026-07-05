<script setup lang="ts">
/**
 * Data-driven props editor: renders inputs from a BlockDefinition's fields.
 * Handles nested 'items' arrays generically, so no block needs its own editor.
 */
import MediaPicker from '@/components/MediaPicker.vue';
import type { BlockField } from '@/blocks/definitions';

const props = defineProps<{ fields: BlockField[]; modelValue: Record<string, any> }>();
const emit = defineEmits<{ 'update:modelValue': [value: Record<string, any>] }>();

function set(key: string, value: unknown): void {
  emit('update:modelValue', { ...props.modelValue, [key]: value });
}

function addItem(field: BlockField): void {
  const blank = Object.fromEntries((field.itemFields ?? []).map((f) => [f.key, f.type === 'switch' ? false : '']));
  set(field.key, [...(props.modelValue[field.key] ?? []), blank]);
}

function removeItem(field: BlockField, index: number): void {
  const list = [...(props.modelValue[field.key] ?? [])];
  list.splice(index, 1);
  set(field.key, list);
}

function setItem(field: BlockField, index: number, key: string, value: unknown): void {
  const list = [...(props.modelValue[field.key] ?? [])];
  list[index] = { ...list[index], [key]: value };
  set(field.key, list);
}
</script>

<template>
  <ElForm label-position="top" size="small">
    <template v-for="field in fields" :key="field.key">
      <!-- Repeating items -->
      <ElFormItem v-if="field.type === 'items'" :label="field.label">
        <div class="items-editor">
          <ElCard v-for="(item, i) in modelValue[field.key] ?? []" :key="i" shadow="never" class="item-card">
            <template #header>
              <div class="item-head">
                <span>#{{ i + 1 }}</span>
                <ElButton size="small" type="danger" text @click="removeItem(field, i)">Remove</ElButton>
              </div>
            </template>
            <ElFormItem v-for="sub in field.itemFields" :key="sub.key" :label="sub.label">
              <MediaPicker v-if="sub.type === 'image'" :model-value="item[sub.key]" @update:model-value="setItem(field, i, sub.key, $event)" />
              <ElSwitch v-else-if="sub.type === 'switch'" :model-value="!!item[sub.key]" @update:model-value="setItem(field, i, sub.key, $event)" />
              <ElInput v-else-if="sub.type === 'textarea'" :model-value="item[sub.key]" type="textarea" :rows="2" @update:model-value="setItem(field, i, sub.key, $event)" />
              <ElInput v-else :model-value="item[sub.key]" @update:model-value="setItem(field, i, sub.key, $event)" />
            </ElFormItem>
          </ElCard>
          <ElButton size="small" plain @click="addItem(field)">+ Add {{ field.label }}</ElButton>
        </div>
      </ElFormItem>

      <!-- Scalar fields -->
      <ElFormItem v-else :label="field.label">
        <MediaPicker v-if="field.type === 'image'" :model-value="modelValue[field.key]" @update:model-value="set(field.key, $event)" />
        <ElSwitch v-else-if="field.type === 'switch'" :model-value="!!modelValue[field.key]" @update:model-value="set(field.key, $event)" />
        <ElInputNumber v-else-if="field.type === 'number'" :model-value="Number(modelValue[field.key] ?? 0)" @update:model-value="set(field.key, $event)" />
        <ElInput v-else-if="field.type === 'textarea'" :model-value="modelValue[field.key]" type="textarea" :rows="3" @update:model-value="set(field.key, $event)" />
        <ElInput v-else-if="field.type === 'richtext'" :model-value="modelValue[field.key]" type="textarea" :rows="8" spellcheck="false" class="mono" @update:model-value="set(field.key, $event)" />
        <ElColorPicker v-else-if="field.type === 'color'" :model-value="modelValue[field.key]" @update:model-value="set(field.key, $event)" />
        <ElSelect v-else-if="field.type === 'select'" :model-value="modelValue[field.key]" style="width: 100%" @update:model-value="set(field.key, $event)">
          <ElOption v-for="o in field.options" :key="o.value" :value="o.value" :label="o.label" />
        </ElSelect>
        <ElInput v-else :model-value="modelValue[field.key]" @update:model-value="set(field.key, $event)" />
      </ElFormItem>
    </template>
    <ElEmpty v-if="!fields.length" description="This block has no options" :image-size="60" />
  </ElForm>
</template>

<style scoped>
.items-editor { width: 100%; display: flex; flex-direction: column; gap: 8px; }
.item-card :deep(.el-card__header) { padding: 6px 12px; }
.item-head { display: flex; justify-content: space-between; align-items: center; }
.mono :deep(textarea) { font-family: ui-monospace, monospace; font-size: 12px; }
</style>
