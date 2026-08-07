<script setup lang="ts">
/**
 * Birthday events. Each row is one wish wall, with the two counts that decide whether
 * it is usable: how many gifts a visitor can choose from, and how many wishes are
 * waiting for approval.
 */
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { http } from '@/api/http';
import { useCrud } from '@/composables/useCrud';
import { PERMISSIONS, slugify, type ApiResponse } from '@cms/shared';

const router = useRouter();
const crud = useCrud<any>({ endpoint: '/birthday' });

const dialog = ref(false);
const blank = {
  title: '',
  slug: '',
  celebrantName: '',
  description: '',
  themeColor: '#ea480c',
  isOpen: true,
  isActive: true,
  requiresApproval: false,
};
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
    const { data } = await http.post<ApiResponse<any>>('/birthday', {
      ...form,
      slug: form.slug || slugify(form.title),
    });
    dialog.value = false;
    ElMessage.success('สร้างงานวันเกิดแล้ว — ขั้นต่อไปคือใส่ของขวัญให้เลือก');
    void router.push({ name: 'birthday-edit', params: { id: data.data.id } });
  } finally {
    saving.value = false;
  }
}

/** A wall with no gifts leaves the form's picker empty, so it is worth flagging early. */
function readiness(row: any): { ready: boolean; message: string } {
  const gifts = row.gifts?.filter((g: any) => g.isActive).length ?? 0;
  if (gifts === 0) return { ready: false, message: 'ยังไม่มีของขวัญให้เลือก' };
  return { ready: true, message: `มีของขวัญ ${gifts} ชิ้น` };
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>อวยพรวันเกิด</h1>
      <ElButton v-permission="PERMISSIONS.BIRTHDAY_MANAGE" type="primary" @click="openCreate">
        + สร้างงานวันเกิด
      </ElButton>
    </div>

    <ElCard>
      <div class="toolbar">
        <ElInput v-model="crud.query.search" placeholder="ค้นหาชื่องาน…" clearable style="width: 240px" />
      </div>

      <ElTable v-loading="crud.loading.value" :data="crud.items.value">
        <ElTableColumn label="งาน" min-width="240">
          <template #default="{ row }">
            <b>{{ row.title }}</b>
            <div class="text-muted">/birthday/{{ row.slug }}</div>
            <div v-if="row.celebrantName" class="text-muted">วันเกิดของ {{ row.celebrantName }}</div>
          </template>
        </ElTableColumn>

        <ElTableColumn label="ของขวัญ" width="150" align="center">
          <template #default="{ row }">
            <!-- Never colour alone: the ✓/⚠ glyph carries the same state. -->
            <span :class="readiness(row).ready ? 'ok' : 'warn'">
              {{ readiness(row).ready ? '✓' : '⚠' }} {{ row.gifts?.length ?? 0 }} ชิ้น
            </span>
          </template>
        </ElTableColumn>

        <ElTableColumn label="คำอวยพร" width="120" align="center">
          <template #default="{ row }">{{ row._count?.wishes ?? 0 }}</template>
        </ElTableColumn>

        <ElTableColumn label="สถานะ" width="200" align="center">
          <template #default="{ row }">
            <ElTag size="small" :type="row.isActive ? 'success' : 'info'">
              {{ row.isActive ? 'เปิดใช้งาน' : 'ปิดอยู่' }}
            </ElTag>
            <ElTag size="small" class="ml" :type="row.isOpen ? 'success' : 'warning'">
              {{ row.isOpen ? 'รับคำอวยพร' : 'ปิดรับแล้ว' }}
            </ElTag>
          </template>
        </ElTableColumn>

        <ElTableColumn label="จัดการ" width="300" fixed="right">
          <template #default="{ row }">
            <ElButton size="small" @click="router.push({ name: 'birthday-edit', params: { id: row.id } })">
              แก้ไข
            </ElButton>
            <ElButton size="small" plain @click="router.push({ name: 'birthday-wishes', params: { id: row.id } })">
              คำอวยพร
            </ElButton>
            <ElButton
              v-permission="PERMISSIONS.BIRTHDAY_MANAGE"
              size="small"
              type="danger"
              plain
              @click="crud.deleteItem(row.id, row.title)"
            >
              ลบ
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>

      <div v-if="!crud.loading.value && !crud.items.value.length" class="empty">
        <div class="empty-icon">🎈</div>
        <p>ยังไม่มีงานวันเกิด — กด "สร้างงานวันเกิด" เพื่อเริ่ม</p>
      </div>

      <ElPagination
        v-if="crud.meta.value.total > crud.meta.value.limit"
        class="mt"
        layout="total, prev, pager, next"
        :total="crud.meta.value.total"
        :page-size="crud.meta.value.limit"
        :current-page="crud.query.page"
        @current-change="crud.query.page = $event"
      />
    </ElCard>

    <ElDialog v-model="dialog" title="สร้างงานวันเกิด" width="520px">
      <ElForm label-position="top">
        <ElFormItem label="ชื่องาน" required>
          <ElInput v-model="form.title" placeholder="เช่น อวยพรวันเกิดพี่เจี๊ยบ" />
        </ElFormItem>
        <ElFormItem label="Slug (ใช้ใน URL)">
          <ElInput v-model="form.slug" :placeholder="slugify(form.title) || 'birthday'" />
          <div class="hint text-muted">เว้นว่างไว้ระบบจะสร้างให้จากชื่องาน</div>
        </ElFormItem>
        <ElFormItem label="ชื่อเจ้าของวันเกิด">
          <ElInput v-model="form.celebrantName" placeholder="เช่น พี่เจี๊ยบ" />
        </ElFormItem>
        <ElFormItem label="สีหลักของงาน">
          <ElColorPicker v-model="form.themeColor" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialog = false">ยกเลิก</ElButton>
        <ElButton type="primary" :disabled="!canSubmit" :loading="saving" @click="create">สร้าง</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.mt { margin-top: 12px; }
.ml { margin-left: 6px; }
.hint { font-size: 12px; margin-top: 4px; }
.ok { color: var(--el-color-success); font-weight: 600; }
.warn { color: var(--el-color-warning); font-weight: 600; }
.empty { padding: 32px 0; text-align: center; }
.empty-icon { font-size: 40px; margin-bottom: 8px; }
</style>
