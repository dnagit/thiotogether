<script setup lang="ts">
/**
 * Reusable media picker: browse the media library or upload, then emit the
 * chosen file URL. Used by page SEO images, blocks, bank QR codes, etc.
 *
 * `kind` decides what the library is filtered to and what the file dialog accepts. It stays
 * pictures unless a caller asks for more, so the fields that genuinely only work with an
 * image — a background, a QR code — cannot be handed a clip by accident.
 */
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { http } from '@/api/http';
import { isVideoUrl, type ApiResponse, type MediaItem } from '@cms/shared';

const props = withDefaults(
  defineProps<{
    modelValue?: string | null;
    accept?: string;
    /** 'image' (the default) or 'media' — pictures and video together. */
    kind?: 'image' | 'media';
  }>(),
  { modelValue: null, accept: undefined, kind: 'image' },
);
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>();

const dialog = ref(false);
const items = ref<MediaItem[]>([]);
const loading = ref(false);
const search = ref('');
const uploading = ref(false);
const fileInput = ref<HTMLInputElement>();

const allowsVideo = computed(() => props.kind === 'media');
const typeFilter = computed(() => (allowsVideo.value ? 'IMAGE,VIDEO' : 'IMAGE'));
const acceptAttr = computed(
  () => props.accept ?? (allowsVideo.value ? 'image/*,video/*' : 'image/*'),
);
const chooseLabel = computed(() => (allowsVideo.value ? 'Choose Image or Video…' : 'Choose Image…'));

/** Videos have no generated thumbnail, so the file itself stands in for one. */
const isVideoItem = (item: MediaItem): boolean =>
  item.type === 'VIDEO' || isVideoUrl(item.url);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const { data } = await http.get<ApiResponse<MediaItem[]>>('/media', {
      params: { limit: 60, search: search.value || undefined, type: typeFilter.value },
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
      <!--
        The preview is muted and controlless: it is here to show which file is selected, not
        to be watched. `preload="metadata"` is enough to paint the first frame.
      -->
      <video
        v-if="isVideoUrl(props.modelValue)"
        :src="props.modelValue"
        class="thumb"
        muted
        playsinline
        preload="metadata"
      />
      <ElImage v-else :src="props.modelValue" fit="cover" class="thumb" />
      <div class="preview-actions">
        <ElButton size="small" @click="dialog = true">Change</ElButton>
        <ElButton size="small" type="danger" text @click="emit('update:modelValue', null)">Remove</ElButton>
      </div>
    </div>
    <ElButton v-else @click="dialog = true">{{ chooseLabel }}</ElButton>

    <ElDialog v-model="dialog" title="Media Library" width="720px" append-to-body>
      <div class="toolbar">
        <ElInput v-model="search" placeholder="Search…" clearable style="width: 240px" @change="load" />
        <ElButton :loading="uploading" @click="fileInput?.click()">Upload</ElButton>
        <input ref="fileInput" type="file" multiple :accept="acceptAttr" hidden @change="onUpload" />
      </div>
      <div v-loading="loading" class="grid">
        <div v-for="item in items" :key="item.id" class="cell" @click="pick(item)">
          <div v-if="isVideoItem(item)" class="cell-video">
            <video :src="item.url" class="cell-img" muted playsinline preload="metadata" />
            <span class="play" aria-hidden="true">▶</span>
          </div>
          <ElImage v-else :src="item.thumbnailUrl ?? item.url" fit="cover" class="cell-img" lazy />
          <div class="cell-name">{{ item.originalName }}</div>
        </div>
        <ElEmpty v-if="!loading && !items.length" description="No media yet" />
      </div>
    </ElDialog>
  </div>
</template>

<style scoped>
.preview { display: flex; align-items: center; gap: 12px; }
.thumb { width: 96px; height: 64px; border-radius: 6px; border: 1px solid var(--el-border-color); object-fit: cover; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; max-height: 420px; overflow-y: auto; }
.cell { cursor: pointer; border: 1px solid var(--el-border-color-light); border-radius: 6px; overflow: hidden; }
.cell:hover { border-color: var(--el-color-primary); }
.cell-img { width: 100%; height: 90px; display: block; object-fit: cover; background: #000; }
.cell-video { position: relative; }
/* Marks a cell as a clip: a still first frame is otherwise indistinguishable from a photo. */
.play {
  position: absolute;
  right: 6px;
  bottom: 6px;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgb(0 0 0 / 55%);
  color: #fff;
  font-size: 10px;
  line-height: 1;
}
.cell-name { font-size: 11px; padding: 4px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
