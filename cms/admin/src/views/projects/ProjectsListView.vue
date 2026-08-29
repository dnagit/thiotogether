<script setup lang="ts">
/**
 * Projects — the list. Creating one only asks for a title; everything else is on the edit
 * page, which is where the pictures and the write-up are.
 */
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { http } from '@/api/http';
import { useCrud } from '@/composables/useCrud';
import { PERMISSIONS, slugify, type ApiResponse } from '@cms/shared';

const router = useRouter();
const crud = useCrud<any>({ endpoint: '/projects' });

const dialog = ref(false);
const blank = { title: '', slug: '', summary: '', isActive: true };
const form = reactive({ ...blank });
const saving = ref(false);

function openCreate(): void {
  Object.assign(form, blank);
  dialog.value = true;
}

const canSubmit = computed(() => form.title.trim().length > 0);

async function create(): Promise<void> {
  saving.value = true;
  try {
    const { data } = await http.post<ApiResponse<any>>('/projects', {
      ...form,
      slug: form.slug || slugify(form.title),
    });
    dialog.value = false;
    ElMessage.success('สร้างโปรเจกต์แล้ว — ขั้นต่อไปคือใส่รูปและรายละเอียด');
    void router.push({ name: 'project-edit', params: { id: data.data.id } });
  } finally {
    saving.value = false;
  }
}

/** A project with no cover shows an empty card on the site, so it is worth flagging here. */
function readiness(row: any): { ready: boolean; message: string } {
  if (!row.coverImage) return { ready: false, message: 'ยังไม่มีรูปปก' };
  const gallery = Array.isArray(row.images) ? row.images.length : 0;
  return { ready: true, message: gallery ? `มีรูปในแกลเลอรี ${gallery} รูป` : 'มีรูปปกแล้ว' };
}

const dateText = (value: string | null): string =>
  value ? new Date(value).toLocaleDateString('th-TH', { dateStyle: 'medium' }) : '—';
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>โปรเจกต์</h1>
      <ElButton v-permission="PERMISSIONS.PROJECTS_MANAGE" type="primary" @click="openCreate">
        + สร้างโปรเจกต์
      </ElButton>
    </div>

    <ElCard>
      <div class="toolbar">
        <ElInput
          v-model="crud.query.search"
          placeholder="ค้นหาชื่อโปรเจกต์…"
          clearable
          style="width: 240px"
        />
      </div>

      <ElTable
        v-loading="crud.loading.value"
        :data="crud.items.value"
        @sort-change="crud.onSortChange"
      >
        <ElTableColumn label="รูปปก" width="110" align="center">
          <template #default="{ row }">
            <ElImage
              v-if="row.coverImage"
              :src="row.coverImage"
              :preview-src-list="[row.coverImage]"
              preview-teleported
              fit="cover"
              class="thumb"
            />
            <span v-else class="text-muted">—</span>
          </template>
        </ElTableColumn>

        <ElTableColumn label="โปรเจกต์" min-width="260" prop="title" sortable="custom">
          <template #default="{ row }">
            <b>{{ row.title }}</b>
            <div v-if="row.summary" class="text-muted">{{ row.summary }}</div>
          </template>
        </ElTableColumn>

        <ElTableColumn label="วันที่" width="150" prop="eventDate" sortable="custom">
          <template #default="{ row }">{{ dateText(row.eventDate) }}</template>
        </ElTableColumn>

        <ElTableColumn label="ความพร้อม" width="180">
          <template #default="{ row }">
            <ElTag size="small" :type="readiness(row).ready ? 'success' : 'warning'">
              {{ readiness(row).message }}
            </ElTag>
          </template>
        </ElTableColumn>

        <ElTableColumn label="สถานะ" width="120" align="center">
          <template #default="{ row }">
            <ElTag size="small" :type="row.isActive ? 'success' : 'info'">
              {{ row.isActive ? 'แสดงบนเว็บ' : 'ซ่อน' }}
            </ElTag>
          </template>
        </ElTableColumn>

        <ElTableColumn label="ลำดับ" width="90" align="center" prop="sortOrder" sortable="custom" />

        <ElTableColumn label="จัดการ" width="180" fixed="right">
          <template #default="{ row }">
            <ElButton
              size="small"
              plain
              @click="router.push({ name: 'project-edit', params: { id: row.id } })"
            >
              แก้ไข
            </ElButton>
            <ElButton
              v-permission="PERMISSIONS.PROJECTS_MANAGE"
              size="small"
              type="danger"
              text
              @click="crud.deleteItem(row.id, row.title)"
            >
              ลบ
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>

      <div v-if="!crud.loading.value && !crud.items.value.length" class="empty">
        <p>ยังไม่มีโปรเจกต์ — กด "สร้างโปรเจกต์" เพื่อเริ่ม</p>
      </div>

      <ElPagination
        v-if="crud.meta.value.total > crud.meta.value.limit"
        class="pager"
        layout="prev, pager, next, total"
        :current-page="crud.query.page"
        :page-size="crud.query.limit"
        :total="crud.meta.value.total"
        @current-change="(p: number) => (crud.query.page = p)"
      />
    </ElCard>

    <ElDialog v-model="dialog" title="สร้างโปรเจกต์" width="480px">
      <ElForm label-position="top">
        <ElFormItem label="ชื่อโปรเจกต์" required>
          <ElInput v-model="form.title" placeholder="เช่น THIONS for THI-O Happy 21st Birthday" />
        </ElFormItem>
        <ElFormItem label="Slug (ใช้ใน URL)">
          <ElInput v-model="form.slug" />
          <div class="hint text-muted">เว้นว่างไว้ระบบจะสร้างให้จากชื่อโปรเจกต์</div>
        </ElFormItem>
        <ElFormItem label="คำโปรย">
          <ElInput v-model="form.summary" type="textarea" :rows="2" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialog = false">ยกเลิก</ElButton>
        <ElButton type="primary" :disabled="!canSubmit" :loading="saving" @click="create">
          สร้าง
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.toolbar { display: flex; gap: 12px; margin-bottom: 16px; }
.thumb { width: 72px; height: 54px; border-radius: 6px; }
.empty { padding: 32px; text-align: center; color: var(--el-text-color-secondary); }
.pager { margin-top: 16px; display: flex; justify-content: flex-end; }
.hint { font-size: 12px; margin-top: 4px; }
</style>
