<script setup lang="ts">
/**
 * Reusable media picker: browse the media library or upload, then emit the
 * chosen file URL. Used by page SEO images, blocks, bank QR codes, etc.
 */
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { http } from '@/api/http';
import type { ApiResponse, MediaItem } from '@cms/shared';

const props = defineProps<{ modelValue?: string | null; accept?: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>();

const dialog = ref(false);
const items = ref<MediaItem[]>([]);
const loading = ref(false);
const search = ref('');
const uploading = ref(false);
const fileInput = ref<HTMLInputElement>();

async function load(): Promise<void> {
  loading.value = true;
  try {
    const { data } = await http.get<ApiResponse<MediaItem[]>>('/media', {
      params: { limit: 60, search: search.value || undefined, type: 'IMAGE' },
    });
    items.value = data.data;
  } finally {
    loading.value = false;
  }
}
watch(dialog, (open) => open && void load());

function pick(item: MediaItem): void {
  emit('update:modelValue', item.url);
  dialog.value = false;
}

async function onUpload(event: Event): Promise<void> {
  const files = (event.target as HTMLInputElement).files;
  if (!files?.length) return;
  const form = new FormData();
  for (const f of files) form.append('files', f);
  form.append('folder', '/');
  uploading.value = true;
  try {
    await http.post('/media/upload', form);
    ElMessage.success('Uploaded');
    await load();
  } finally {
    uploading.value = false;
    if (fileInput.value) fileInput.value.value = '';
  }
}
</script>

<template>
  <div class="media-field">
    <div v-if="props.modelValue" class="preview">
      <ElImage :src="props.modelValue" fit="cover" class="thumb" />
      <div class="preview-actions">
        <ElButton size="small" @click="dialog = true">Change</ElButton>
        <ElButton size="small" type="danger" text @click="emit('update:modelValue', null)">Remove</ElButton>
      </div>
    </div>
    <ElButton v-else @click="dialog = true">Choose Image…</ElButton>

    <ElDialog v-model="dialog" title="Media Library" width="720px" append-to-body>
      <div class="toolbar">
        <ElInput v-model="search" placeholder="Search…" clearable style="width: 240px" @change="load" />
        <ElButton :loading="uploading" @click="fileInput?.click()">Upload</ElButton>
        <input ref="fileInput" type="file" multiple :accept="props.accept ?? 'image/*'" hidden @change="onUpload" />
      </div>
      <div v-loading="loading" class="grid">
        <div v-for="item in items" :key="item.id" class="cell" @click="pick(item)">
          <ElImage :src="item.thumbnailUrl ?? item.url" fit="cover" class="cell-img" lazy />
          <div class="cell-name">{{ item.originalName }}</div>
        </div>
        <ElEmpty v-if="!loading && !items.length" description="No media yet" />
      </div>
    </ElDialog>
  </div>
</template>

<style scoped>
.preview { display: flex; align-items: center; gap: 12px; }
.thumb { width: 96px; height: 64px; border-radius: 6px; border: 1px solid var(--el-border-color); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; max-height: 420px; overflow-y: auto; }
.cell { cursor: pointer; border: 1px solid var(--el-border-color-light); border-radius: 6px; overflow: hidden; }
.cell:hover { border-color: var(--el-color-primary); }
.cell-img { width: 100%; height: 90px; display: block; }
.cell-name { font-size: 11px; padding: 4px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
