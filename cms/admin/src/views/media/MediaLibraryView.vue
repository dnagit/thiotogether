<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { confirmDelete } from '@/utils/confirm';
import { http } from '@/api/http';
import { useCrud } from '@/composables/useCrud';
import { PERMISSIONS, type ApiResponse, type MediaItem } from '@cms/shared';

const crud = useCrud<MediaItem>({ endpoint: '/media', params: {} });
crud.query.limit = 48;

const folders = ref<string[]>(['/']);
const currentFolder = ref('/');
const fileInput = ref<HTMLInputElement>();
const uploading = ref(false);
const dragOver = ref(false);
const preview = ref<MediaItem | null>(null);

async function loadFolders(): Promise<void> {
  const { data } = await http.get<ApiResponse<string[]>>('/media/folders');
  folders.value = [...new Set(['/', ...data.data])];
}
void loadFolders();

function selectFolder(folder: string): void {
  currentFolder.value = folder;
  crud.query.filters.folder = folder;
}
crud.query.filters.folder = '/';

async function upload(files: FileList | File[]): Promise<void> {
  if (!files.length) return;
  const form = new FormData();
  for (const f of files) form.append('files', f);
  form.append('folder', currentFolder.value);
  uploading.value = true;
  try {
    await http.post('/media/upload', form);
    ElMessage.success('Uploaded');
    await crud.fetchList();
    await loadFolders();
  } finally {
    uploading.value = false;
    if (fileInput.value) fileInput.value.value = '';
  }
}

function onDrop(e: DragEvent): void {
  dragOver.value = false;
  if (e.dataTransfer?.files) void upload(e.dataTransfer.files);
}

async function newFolder(): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('Folder path (e.g. /banners):', 'New Folder', {
      inputPattern: /^\/[a-z0-9-_/]*$/,
      inputErrorMessage: 'Must start with / — lowercase letters, numbers, dashes',
    });
    if (value && !folders.value.includes(value)) folders.value.push(value);
    selectFolder(value);
  } catch {
    /* cancelled */
  }
}

async function remove(item: MediaItem): Promise<void> {
  try {
    if (!(await confirmDelete(item.originalName, { note: `ต้องการลบไฟล์ "${item.originalName}" ใช่หรือไม่?` }))) return;
  } catch {
    return;
  }
  await http.delete(`/media/${item.id}`);
  preview.value = null;
  await crud.fetchList();
}

function copyUrl(item: MediaItem): void {
  void navigator.clipboard.writeText(item.url);
  ElMessage.success('URL copied');
}

const typeIcon = (t: string) => ({ IMAGE: '🖼️', VIDEO: '🎬', PDF: '📕', DOCUMENT: '📄' })[t] ?? '📄';
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>Media Library</h1>
      <div>
        <ElButton @click="newFolder">+ Folder</ElButton>
        <ElButton v-permission="PERMISSIONS.MEDIA_UPLOAD" type="primary" :loading="uploading" @click="fileInput?.click()">Upload</ElButton>
        <input ref="fileInput" type="file" multiple hidden @change="upload(($event.target as HTMLInputElement).files!)" />
      </div>
    </div>

    <ElRow :gutter="16">
      <ElCol :xs="24" :sm="6" :md="4">
        <ElCard header="Folders">
          <div
            v-for="f in folders"
            :key="f"
            class="folder"
            :class="{ active: f === currentFolder }"
            @click="selectFolder(f)"
          >📁 {{ f }}</div>
        </ElCard>
      </ElCol>

      <ElCol :xs="24" :sm="18" :md="20">
        <ElCard>
          <div class="toolbar">
            <ElInput v-model="crud.query.search" placeholder="Search files…" clearable style="width: 240px" />
            <ElSelect v-model="crud.query.filters.type" placeholder="Type" clearable style="width: 140px">
              <ElOption v-for="t in ['IMAGE', 'VIDEO', 'PDF', 'DOCUMENT']" :key="t" :value="t" :label="t" />
            </ElSelect>
          </div>

          <div
            v-loading="crud.loading.value"
            class="dropzone"
            :class="{ over: dragOver }"
            @dragover.prevent="dragOver = true"
            @dragleave="dragOver = false"
            @drop.prevent="onDrop"
          >
            <div class="grid">
              <div v-for="item in crud.items.value" :key="item.id" class="cell" @click="preview = item">
                <ElImage v-if="item.type === 'IMAGE'" :src="item.thumbnailUrl ?? item.url" fit="cover" class="cell-img" lazy />
                <div v-else class="cell-file">{{ typeIcon(item.type) }}</div>
                <div class="cell-name">{{ item.originalName }}</div>
              </div>
            </div>
            <ElEmpty v-if="!crud.loading.value && !crud.items.value.length" description="Drop files here or click Upload" />
          </div>

          <ElPagination v-model:current-page="crud.query.page" class="mt" layout="prev, pager, next, total" :total="crud.meta.value.total" :page-size="crud.query.limit" />
        </ElCard>
      </ElCol>
    </ElRow>

    <!-- Preview drawer -->
    <ElDrawer :model-value="!!preview" title="File details" size="420px" @close="preview = null">
      <template v-if="preview">
        <ElImage v-if="preview.type === 'IMAGE'" :src="preview.url" fit="contain" style="width: 100%" :preview-src-list="[preview.url]" />
        <video v-else-if="preview.type === 'VIDEO'" :src="preview.url" controls style="width: 100%" />
        <div v-else class="doc-preview">{{ typeIcon(preview.type) }} {{ preview.originalName }}</div>

        <ElDescriptions :column="1" border size="small" class="mt">
          <ElDescriptionsItem label="Name">{{ preview.originalName }}</ElDescriptionsItem>
          <ElDescriptionsItem label="Type">{{ preview.mimeType }}</ElDescriptionsItem>
          <ElDescriptionsItem label="Size">{{ (preview.size / 1024).toFixed(1) }} KB</ElDescriptionsItem>
          <ElDescriptionsItem v-if="preview.width" label="Dimensions">{{ preview.width }} × {{ preview.height }}</ElDescriptionsItem>
          <ElDescriptionsItem label="Folder">{{ preview.folder }}</ElDescriptionsItem>
          <ElDescriptionsItem label="URL"><code class="url">{{ preview.url }}</code></ElDescriptionsItem>
        </ElDescriptions>
        <div class="mt">
          <ElButton @click="copyUrl(preview)">Copy URL</ElButton>
          <ElButton v-permission="PERMISSIONS.MEDIA_DELETE" type="danger" plain @click="remove(preview)">Delete</ElButton>
        </div>
      </template>
    </ElDrawer>
  </div>
</template>

<style scoped>
.folder { padding: 6px 8px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.folder.active { background: var(--el-color-primary-light-9); }
.dropzone { border: 2px dashed transparent; border-radius: 8px; min-height: 300px; }
.dropzone.over { border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; }
.cell { cursor: pointer; border: 1px solid var(--el-border-color-light); border-radius: 8px; overflow: hidden; }
.cell:hover { border-color: var(--el-color-primary); }
.cell-img { width: 100%; height: 100px; display: block; }
.cell-file { height: 100px; display: flex; align-items: center; justify-content: center; font-size: 34px; }
.cell-name { font-size: 11px; padding: 4px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.doc-preview { font-size: 20px; text-align: center; padding: 40px 0; }
.url { font-size: 11px; word-break: break-all; }
.mt { margin-top: 12px; }
</style>
