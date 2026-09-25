<script setup lang="ts">
/**
 * Tracking — the projects. Each holds the tracking numbers of one batch of parcels; the
 * numbers themselves are on the project's own page, a click away.
 *
 * The ID column is what the website's lookup block takes to search one project only.
 */
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useCrud } from '@/composables/useCrud';
import { PERMISSIONS, type TrackingProject } from '@cms/shared';

const router = useRouter();
const crud = useCrud<TrackingProject>({ endpoint: '/tracking/projects' });

const dialog = ref(false);
const blank = { id: null as number | null, name: '', description: '', isActive: true, sortOrder: 0 };
const form = reactive({ ...blank });
const isEdit = computed(() => form.id !== null);
const canSave = computed(() => form.name.trim().length > 0);

function openDialog(row?: TrackingProject | Record<string, any>): void {
  Object.assign(form, blank, row ? { ...row, description: row.description ?? '' } : {});
  dialog.value = true;
}

async function save(): Promise<void> {
  const payload = {
    name: form.name.trim(),
    description: form.description.trim() || null,
    isActive: form.isActive,
    sortOrder: form.sortOrder,
  };
  if (form.id) {
    await crud.updateItem(form.id, payload);
    dialog.value = false;
  } else {
    const made = await crud.createItem(payload);
    dialog.value = false;
    openEntries(made);
  }
}

function openEntries(row: TrackingProject | Record<string, any>): void {
  void router.push({ name: 'tracking-entries', params: { id: row.id } });
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>Tracking</h1>
      <ElButton v-permission="PERMISSIONS.TRACKING_MANAGE" type="primary" @click="openDialog()">
        + สร้าง Project
      </ElButton>
    </div>

    <ElCard>
      <div class="toolbar">
        <ElInput v-model="crud.query.search" placeholder="ค้นหาชื่อ Project…" clearable style="max-width: 260px" />
      </div>

      <ElTable v-loading="crud.loading.value" :data="crud.items.value" @sort-change="crud.onSortChange">
        <ElTableColumn prop="id" label="ID" width="70" />
        <ElTableColumn prop="name" label="ชื่อ Project" min-width="200" sortable="custom">
          <template #default="{ row }">
            <ElLink type="primary" @click="openEntries(row)">{{ row.name }}</ElLink>
            <div v-if="row.description" class="hint">{{ row.description }}</div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="Tracking" width="100" align="center">
          <template #default="{ row }">{{ row._count?.entries ?? 0 }}</template>
        </ElTableColumn>
        <ElTableColumn label="บนเว็บ" width="100" align="center">
          <template #default="{ row }">
            <ElTag size="small" :type="row.isActive ? 'success' : 'info'">
              {{ row.isActive ? 'แสดง' : 'ซ่อน' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="จัดการ" width="230" fixed="right">
          <template #default="{ row }">
            <ElButton size="small" type="primary" plain @click="openEntries(row)">Tracking</ElButton>
            <ElButton v-permission="PERMISSIONS.TRACKING_MANAGE" size="small" @click="openDialog(row)">
              แก้ไข
            </ElButton>
            <ElButton
              v-permission="PERMISSIONS.TRACKING_MANAGE"
              size="small"
              type="danger"
              text
              @click="crud.deleteItem(row.id, row.name)"
            >
              ลบ
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>

      <ElPagination
        v-model:current-page="crud.query.page"
        class="mt"
        layout="prev, pager, next, total"
        :total="crud.meta.value.total"
        :page-size="crud.query.limit"
      />
    </ElCard>

    <ElDialog v-model="dialog" :title="isEdit ? 'แก้ไข Project' : 'สร้าง Project'" width="480px">
      <ElForm label-position="top" @submit.prevent>
        <ElFormItem label="ชื่อ Project" required>
          <ElInput v-model="form.name" maxlength="200" placeholder="เช่น ของขวัญวันเกิด 2026" />
        </ElFormItem>
        <ElFormItem label="รายละเอียด">
          <ElInput
            v-model="form.description"
            type="textarea"
            :rows="3"
            maxlength="1000"
            placeholder="แสดงบนเว็บใต้ชื่อ Project เช่น ส่งทางไปรษณีย์ไทย (ไม่บังคับ)"
          />
        </ElFormItem>
        <ElFormItem label="ลำดับ">
          <ElInputNumber v-model="form.sortOrder" :step="1" />
        </ElFormItem>
        <ElFormItem>
          <ElCheckbox v-model="form.isActive">ให้ค้นหาบนเว็บได้</ElCheckbox>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialog = false">ยกเลิก</ElButton>
        <ElButton type="primary" :loading="crud.saving.value" :disabled="!canSave" @click="save">
          บันทึก
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.mt { margin-top: 12px; }
.hint { font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.5; }
</style>
