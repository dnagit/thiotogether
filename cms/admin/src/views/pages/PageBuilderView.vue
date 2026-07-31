<script setup lang="ts">
/**
 * Page Builder: drag-sortable block list + palette + data-driven props editor.
 * Saves the whole block set atomically via PUT /pages/:id/blocks.
 */
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import draggable from 'vuedraggable';
import { http } from '@/api/http';
import BlockPropsEditor from '@/components/BlockPropsEditor.vue';
import { blockDefinitions, blockByType } from '@/blocks/definitions';
import type { ApiResponse, Page, PageBlock } from '@cms/shared';

const route = useRoute();
const router = useRouter();
const pageId = Number(route.params.id);

interface EditableBlock {
  id?: number;
  type: string;
  props: Record<string, any>;
  styles: Record<string, any>;
  settings: Record<string, any>;
  _key: string; // stable client-side key for drag
}

const page = ref<Page | null>(null);
const blocks = ref<EditableBlock[]>([]);
const selectedKey = ref<string | null>(null);
const saving = ref(false);
const paletteOpen = ref(false);

const selected = computed(() => blocks.value.find((b) => b._key === selectedKey.value) ?? null);
const selectedDef = computed(() => (selected.value ? blockByType.get(selected.value.type) : null));

let keySeq = 0;
const nextKey = () => `blk-${++keySeq}`;

async function load(): Promise<void> {
  const [{ data: pageData }, { data: blocksData }] = await Promise.all([
    http.get<ApiResponse<Page>>(`/pages/${pageId}`),
    http.get<ApiResponse<PageBlock[]>>(`/pages/${pageId}/blocks`),
  ]);
  page.value = pageData.data;
  blocks.value = blocksData.data.map((b) => ({
    id: b.id,
    type: b.type,
    props: (b.props as Record<string, any>) ?? {},
    styles: (b.styles as Record<string, any>) ?? {},
    settings: (b.settings as Record<string, any>) ?? {},
    _key: nextKey(),
  }));
}
void load();

function addBlock(type: string): void {
  const def = blockByType.get(type);
  if (!def) return;
  const block: EditableBlock = {
    type,
    props: structuredClone(def.defaultProps) as Record<string, any>,
    styles: {},
    settings: {},
    _key: nextKey(),
  };
  blocks.value.push(block);
  selectedKey.value = block._key;
  paletteOpen.value = false;
}

function removeBlock(key: string): void {
  blocks.value = blocks.value.filter((b) => b._key !== key);
  if (selectedKey.value === key) selectedKey.value = null;
}

function duplicateBlock(block: EditableBlock): void {
  const copy = structuredClone({ ...block, id: undefined }) as EditableBlock;
  copy._key = nextKey();
  const index = blocks.value.findIndex((b) => b._key === block._key);
  blocks.value.splice(index + 1, 0, copy);
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    await http.put(`/pages/${pageId}/blocks`, {
      blocks: blocks.value.map((b, i) => ({
        id: b.id,
        type: b.type,
        props: b.props,
        styles: b.styles,
        settings: b.settings,
        sortOrder: i,
      })),
    });
    ElMessage.success('Blocks saved');
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
        <ElButton text @click="router.push({ name: 'pages' })">← Pages</ElButton>
        <b>{{ page?.title }}</b>
        <code class="text-muted">{{ page?.path }}</code>
      </div>
      <div>
        <ElButton @click="paletteOpen = true">+ Add Block</ElButton>
        <ElButton type="primary" :loading="saving" @click="save">Save</ElButton>
      </div>
    </div>

    <div class="builder-body">
      <!-- Canvas: sortable block list -->
      <div class="canvas">
        <draggable v-model="blocks" item-key="_key" handle=".drag-handle" animation="150">
          <template #item="{ element }">
            <div
              class="block-row"
              :class="{ selected: element._key === selectedKey }"
              @click="selectedKey = element._key"
            >
              <span class="drag-handle">⠿</span>
              <span class="block-icon">{{ blockByType.get(element.type)?.icon ?? '❔' }}</span>
              <span class="block-label">{{ blockByType.get(element.type)?.label ?? element.type }}</span>
              <span class="block-summary text-muted">{{ element.props.headline ?? element.props.title ?? element.props.text ?? '' }}</span>
              <span class="block-actions">
                <ElButton size="small" text @click.stop="duplicateBlock(element)">⧉</ElButton>
                <ElButton size="small" text type="danger" @click.stop="removeBlock(element._key)">✕</ElButton>
              </span>
            </div>
          </template>
        </draggable>
        <ElEmpty v-if="!blocks.length" description="No blocks — click “Add Block” to start building" />
      </div>

      <!-- Inspector -->
      <div class="inspector">
        <template v-if="selected && selectedDef">
          <h3>{{ selectedDef.icon }} {{ selectedDef.label }}</h3>
          <ElTabs>
            <ElTabPane label="Content">
              <BlockPropsEditor v-model="selected.props" :fields="selectedDef.fields" />
            </ElTabPane>
            <ElTabPane label="Style">
              <ElForm label-position="top" size="small">
                <ElFormItem label="Background (CSS color/gradient)">
                  <ElInput v-model="selected.styles.background" placeholder="#f8fafc or var(--color-primary)" />
                </ElFormItem>
                <ElFormItem label="Overlay Image (pinned bottom-left, in front of background)">
                  <ElInput v-model="selected.styles.overlayImage" placeholder="/images/banners/banner-sunflower.png" />
                </ElFormItem>
                <ElFormItem label="Overlay Image 2 (covers the whole section, in front of the first)">
                  <ElInput v-model="selected.styles.overlayImageFull" placeholder="/images/banners/banner-leaf.gif" />
                </ElFormItem>
                <ElFormItem label="Overlay Bottom Offset">
                  <ElInput v-model="selected.styles.overlayBottom" placeholder="0 (px) — negative allowed, e.g. -40" />
                </ElFormItem>
                <ElFormItem label="Overlay Width (blank = responsive default)">
                  <ElInput v-model="selected.styles.overlayWidth" placeholder="100%, 640, or clamp(200px, 50vw, 900px)" />
                </ElFormItem>
                <ElFormItem label="Aspect Ratio (height follows width)">
                  <ElInput v-model="selected.styles.aspectRatio" placeholder="2.1 or 21/10 — blank = height from content" />
                </ElFormItem>
                <ElFormItem label="Text Color"><ElInput v-model="selected.styles.textColor" /></ElFormItem>
                <ElFormItem label="Padding Top"><ElInput v-model="selected.styles.paddingTop" placeholder="4rem" /></ElFormItem>
                <ElFormItem label="Padding Bottom"><ElInput v-model="selected.styles.paddingBottom" placeholder="4rem" /></ElFormItem>
                <ElFormItem label="Custom CSS Class"><ElInput v-model="selected.styles.customClass" /></ElFormItem>
              </ElForm>
            </ElTabPane>
            <ElTabPane label="Settings">
              <ElForm label-position="top" size="small">
                <ElFormItem label="Anchor ID"><ElInput v-model="selected.settings.anchorId" placeholder="section-1" /></ElFormItem>
                <ElFormItem><ElCheckbox v-model="selected.settings.fullWidth">Full width (no container)</ElCheckbox></ElFormItem>
                <ElFormItem><ElCheckbox v-model="selected.settings.hidden">Hidden</ElCheckbox></ElFormItem>
                <ElFormItem><ElCheckbox v-model="selected.settings.hiddenOnMobile">Hidden on mobile</ElCheckbox></ElFormItem>
              </ElForm>
            </ElTabPane>
          </ElTabs>
        </template>
        <ElEmpty v-else description="Select a block to edit" :image-size="80" />
      </div>
    </div>

    <!-- Palette -->
    <ElDrawer v-model="paletteOpen" title="Add Block" size="360px">
      <div class="palette">
        <div v-for="def in blockDefinitions" :key="def.type" class="palette-item" @click="addBlock(def.type)">
          <span class="palette-icon">{{ def.icon }}</span>
          <div>
            <div class="palette-label">{{ def.label }}</div>
            <div class="text-muted">{{ def.category }}</div>
          </div>
        </div>
      </div>
    </ElDrawer>
  </div>
</template>

<style scoped>
.builder { display: flex; flex-direction: column; height: calc(100vh - var(--app-header-height)); }
.builder-toolbar {
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
  padding: 10px 16px; border-bottom: 1px solid var(--el-border-color-light);
}
.builder-body { display: flex; flex: 1; min-height: 0; }
.canvas { flex: 1; overflow-y: auto; padding: 16px; }
.inspector {
  width: 380px; border-left: 1px solid var(--el-border-color-light);
  overflow-y: auto; padding: 16px; background: var(--el-bg-color);
}
.block-row {
  display: flex; align-items: center; gap: 10px; padding: 10px 12px; margin-bottom: 8px;
  border: 1px solid var(--el-border-color-light); border-radius: 8px; cursor: pointer;
  background: var(--el-bg-color);
}
.block-row.selected { border-color: var(--el-color-primary); box-shadow: 0 0 0 1px var(--el-color-primary); }
.drag-handle { cursor: grab; color: var(--el-text-color-secondary); }
.block-label { font-weight: 600; }
.block-summary { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.palette { display: flex; flex-direction: column; gap: 6px; }
.palette-item {
  display: flex; gap: 12px; align-items: center; padding: 10px;
  border: 1px solid var(--el-border-color-light); border-radius: 8px; cursor: pointer;
}
.palette-item:hover { border-color: var(--el-color-primary); }
.palette-icon { font-size: 22px; }
.palette-label { font-weight: 600; }
</style>
