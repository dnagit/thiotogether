<script setup lang="ts">
/**
 * Link pages — the list. Creating one only asks for a title; the buttons, the cover and the
 * QR code are on the edit page.
 */
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { http } from '@/api/http';
import { useCrud } from '@/composables/useCrud';
import { PERMISSIONS, slugify, type ApiResponse } from '@cms/shared';

const router = useRouter();
const crud = useCrud<any>({ endpoint: '/link-pages' });

const dialog = ref(false);
const blank = { title: '', slug: '', subtitle: '', isActive: true };
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
    const { data } = await http.post<ApiResponse<any>>('/link-pages', {
      ...form,
      slug: form.slug || slugify(form.title),
    });
    dialog.value = false;
    ElMessage.success('สร้างหน้าลิงก์แล้ว — ขั้นต่อไปคือใส่รูปปกและลิงก์');
    void router.push({ name: 'link-page-edit', params: { id: data.data.id } });
  } finally {
    saving.value = false;
  }
}

const linkCount = (row: any): number => (Array.isArray(row.links) ? row.links.length : 0);
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>ลิงก์รวม / QR</h1>
      <ElButton v-permission="PERMISSIONS.LINK_PAGES_MANAGE" type="primary" @click="openCreate">
        + สร้างหน้าลิงก์
      </ElButton>
    </div>

    <ElCard>
      <div class="toolbar">
        <ElInput
          v-model="crud.query.search"
          placeholder="ค้นหาชื่อหน้า…"
          clearable
          style="width: 240px"
        />
      </div>

      <ElTable
        v-loading="crud.loading.value"
        :data="crud.items.value"
        @sort-change="crud.onSortChange"
      >
        <ElTableColumn label="รูปปก" width="100" align="center">
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

        <ElTableColumn label="หน้า" min-width="260" prop="title" sortable="custom">
          <template #default="{ row }">
            <b>{{ row.title }}</b>
            <div class="text-muted">{{ row.publicUrl }}</div>
          </template>
        </ElTableColumn>

        <ElTableColumn label="ลิงก์" width="120" align="center">
          <template #default="{ row }">
            <ElTag size="small" :type="linkCount(row) ? 'success' : 'warning'">
              {{ linkCount(row) ? `${linkCount(row)} ลิงก์` : 'ยังไม่มีลิงก์' }}
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

        <ElTableColumn label="จัดการ" width="200" fixed="right">
          <template #default="{ row }">
            <ElButton
              size="small"
              plain
              @click="router.push({ name: 'link-page-edit', params: { id: row.id } })"
            >
              แก้ไข / QR
            </ElButton>
            <ElButton
              v-permission="PERMISSIONS.LINK_PAGES_MANAGE"
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
        <p>ยังไม่มีหน้าลิงก์ — กด "สร้างหน้าลิงก์" เพื่อเริ่ม</p>
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

    <ElDialog v-model="dialog" title="สร้างหน้าลิงก์" width="480px">
      <ElForm label-position="top">
        <ElFormItem label="ชื่อหน้า" required>
          <ElInput v-model="form.title" placeholder="เช่น Where We Are - The 2nd Album" />
        </ElFormItem>
        <ElFormItem label="Slug (ใช้ใน URL)">
          <ElInput v-model="form.slug" />
          <div class="hint text-muted">เว้นว่างไว้ระบบจะสร้างให้จากชื่อหน้า</div>
        </ElFormItem>
        <ElFormItem label="ข้อความใต้ชื่อ">
          <ElInput v-model="form.subtitle" placeholder="เช่น Choose music service" />
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
.thumb { width: 54px; height: 54px; border-radius: 6px; }
.empty { padding: 32px; text-align: center; color: var(--el-text-color-secondary); }
.pager { margin-top: 16px; display: flex; justify-content: flex-end; }
.hint { font-size: 12px; margin-top: 4px; }
</style>
