<script setup lang="ts">
/**
 * Data-driven props editor: renders inputs from a BlockDefinition's fields.
 * Handles nested 'items' arrays generically, so no block needs its own editor.
 */
import { ref } from 'vue';
import MediaPicker from '@/components/MediaPicker.vue';
import type { BlockField } from '@/blocks/definitions';

const props = defineProps<{ fields: BlockField[]; modelValue: Record<string, any> }>();
const emit = defineEmits<{ 'update:modelValue': [value: Record<string, any>] }>();

function set(key: string, value: unknown): void {
  emit('update:modelValue', { ...props.modelValue, [key]: value });
}

/** What an empty row of each field type starts as, so the control it renders has a value it understands. */
function blankFor(f: BlockField): unknown {
  if (f.type === 'switch') return false;
  if (f.type === 'select') return f.options?.[0]?.value ?? '';
  return '';
}

function addItem(field: BlockField): void {
  const blank = Object.fromEntries((field.itemFields ?? []).map((f) => [f.key, blankFor(f)]));
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

/**
 * Order is content here — a timeline reads in the order its rows are in, and so does a
 * gallery — so rows have to be movable without being deleted and retyped.
 *
 * Two ways to do it on purpose. The arrows are the ones that always work: they are keyboard
 * operable and they work on a tablet, where HTML5 drag does not fire at all. Dragging is the
 * faster way for a mouse, and is added on top rather than instead.
 */
function moveItem(field: BlockField, from: number, to: number): void {
  const list = [...(props.modelValue[field.key] ?? [])];
  if (to < 0 || to >= list.length || from === to) return;
  const [row] = list.splice(from, 1);
  list.splice(to, 0, row);
  set(field.key, list);
}

/** The row being dragged, as `fieldKey:index` — one editor can show several lists. */
const dragging = ref<string | null>(null);

function onDragStart(field: BlockField, index: number, e: DragEvent): void {
  dragging.value = `${field.key}:${index}`;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    // Firefox ignores a drag that carries nothing, so it is given something to carry.
    e.dataTransfer.setData('text/plain', String(index));
  }
}

function onDrop(field: BlockField, index: number): void {
  const [key, from] = (dragging.value ?? '').split(':');
  dragging.value = null;
  if (key !== field.key) return;
  moveItem(field, Number(from), index);
}
</script>

<template>
  <ElForm label-position="top" size="small">
    <template v-for="field in fields" :key="field.key">
      <!-- Repeating items -->
      <ElFormItem v-if="field.type === 'items'" :label="field.label">
        <div class="items-editor">
          <ElCard
            v-for="(item, i) in modelValue[field.key] ?? []"
            :key="i"
            shadow="never"
            class="item-card"
            :class="{ 'is-dragging': dragging === `${field.key}:${i}` }"
            draggable="true"
            @dragstart="onDragStart(field, i, $event)"
            @dragend="dragging = null"
            @dragover.prevent
            @drop.prevent="onDrop(field, i)"
          >
            <template #header>
              <div class="item-head">
                <span class="item-no">
                  <span class="grip" title="ลากเพื่อสลับลำดับ" aria-hidden="true">⠿</span>
                  #{{ i + 1 }}
                </span>
                <span class="item-tools">
                  <ElButton
                    size="small"
                    text
                    :disabled="i === 0"
                    title="เลื่อนขึ้น"
                    aria-label="เลื่อนขึ้น"
                    @click="moveItem(field, i, i - 1)"
                  >↑</ElButton>
                  <ElButton
                    size="small"
                    text
                    :disabled="i === (modelValue[field.key] ?? []).length - 1"
                    title="เลื่อนลง"
                    aria-label="เลื่อนลง"
                    @click="moveItem(field, i, i + 1)"
                  >↓</ElButton>
                  <ElButton size="small" type="danger" text @click="removeItem(field, i)">Remove</ElButton>
                </span>
              </div>
            </template>
            <ElFormItem v-for="sub in field.itemFields" :key="sub.key" :label="sub.label">
              <MediaPicker v-if="sub.type === 'image'" :model-value="item[sub.key]" @update:model-value="setItem(field, i, sub.key, $event)" />
              <ElSwitch v-else-if="sub.type === 'switch'" :model-value="!!item[sub.key]" @update:model-value="setItem(field, i, sub.key, $event)" />
              <ElInputNumber v-else-if="sub.type === 'number'" :model-value="item[sub.key] === '' || item[sub.key] == null ? undefined : Number(item[sub.key])" @update:model-value="setItem(field, i, sub.key, $event)" />
              <ElColorPicker v-else-if="sub.type === 'color'" :model-value="item[sub.key]" @update:model-value="setItem(field, i, sub.key, $event)" />
              <ElSelect v-else-if="sub.type === 'select'" :model-value="item[sub.key]" style="width: 100%" @update:model-value="setItem(field, i, sub.key, $event)">
                <ElOption v-for="o in sub.options" :key="o.value" :value="o.value" :label="o.label" />
              </ElSelect>
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
        <!--
          Empty stays empty. `Number(undefined ?? 0)` is 0, and a block whose author never
          touched a number field would have 0 written into it the first time anything on the
          block was saved — which is not "no value" to the component reading it, it is a real
          zero. That is how a poster ends up with every margin collapsed.
        -->
        <ElInputNumber
          v-else-if="field.type === 'number'"
          :model-value="modelValue[field.key] === '' || modelValue[field.key] == null ? undefined : Number(modelValue[field.key])"
          @update:model-value="set(field.key, $event ?? '')"
        />
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
.item-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.item-no { display: flex; align-items: center; gap: 6px; }
.item-tools { display: flex; align-items: center; gap: 2px; }
/* The whole card is draggable, so the grip is a hint rather than the only handle. */
.grip { cursor: grab; color: var(--el-text-color-secondary); letter-spacing: -2px; }
.item-card.is-dragging { opacity: 0.5; }
.mono :deep(textarea) { font-family: ui-monospace, monospace; font-size: 12px; }
</style>
