<script setup lang="ts">
/** Recursive nested drag list for menu items. */
import draggable from 'vuedraggable';

defineOptions({ name: 'MenuItemTree' });

const props = defineProps<{ items: any[] }>();
const emit = defineEmits<{ edit: [item: any]; remove: [item: any] }>();

function onEdit(item: any): void {
  emit('edit', item);
}
function onRemove(item: any): void {
  emit('remove', item);
}
</script>

<template>
  <draggable
    :list="props.items"
    item-key="_key"
    group="menu-items"
    handle=".drag-handle"
    animation="150"
    class="menu-tree"
    ghost-class="ghost"
  >
    <template #item="{ element }">
      <div class="menu-node">
        <div class="menu-row" :class="{ inactive: element.isActive === false }">
          <span class="drag-handle">⠿</span>
          <span v-if="element.icon" class="mi-icon">{{ element.icon }}</span>
          <span class="mi-label">{{ element.label }}</span>
          <ElTag size="small" type="info">{{ element.type }}</ElTag>
          <span class="mi-url text-muted">{{ element.url ?? '' }}</span>
          <span class="mi-actions">
            <ElButton size="small" text @click="onEdit(element)">Edit</ElButton>
            <ElButton size="small" text type="danger" @click="onRemove(element)">✕</ElButton>
          </span>
        </div>
        <div class="menu-children">
          <MenuItemTree :items="element.children" @edit="onEdit" @remove="onRemove" />
        </div>
      </div>
    </template>
  </draggable>
</template>

<style scoped>
.menu-tree { min-height: 8px; }
.menu-node { margin-bottom: 6px; }
.menu-row {
  display: flex; align-items: center; gap: 8px; padding: 8px 10px;
  border: 1px solid var(--el-border-color-light); border-radius: 6px;
  background: var(--el-bg-color);
}
.menu-row.inactive { opacity: 0.5; }
.drag-handle { cursor: grab; color: var(--el-text-color-secondary); }
.mi-label { font-weight: 600; }
.mi-url { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.menu-children { margin-left: 28px; margin-top: 6px; }
.ghost { opacity: 0.4; }
</style>
