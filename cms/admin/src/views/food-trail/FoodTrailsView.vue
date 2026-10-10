<script setup lang="ts">
/**
 * Food trails — the list. Each holds restaurants and their dishes; those, and the poster made
 * from them, are on the trail's own page, a click away.
 *
 * The ID column is what the website's checklist block takes to show one trail.
 */
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useCrud } from '@/composables/useCrud';
import { PERMISSIONS, type FoodTrail } from '@cms/shared';

const router = useRouter();
const crud = useCrud<FoodTrail>({ endpoint: '/food-trails/trails' });

const dialog = ref(false);
const blank = { id: null as number | null, name: '', description: '', isActive: true, sortOrder: 0 };
const form = reactive({ ...blank });
const isEdit = computed(() => form.id !== null);
const canSave = computed(() => form.name.trim().length > 0);

function openDialog(row?: FoodTrail | Record<string, any>): void {
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
    openTrail(made);
  }
}

function openTrail(row: FoodTrail | Record<string, any>): void {
  void router.push({ name: 'food-trail-edit', params: { id: row.id } });
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>ตามรอยร้านอาหาร</h1>
      <ElButton v-permission="PERMISSIONS.FOOD_TRAILS_MANAGE" type="primary" @click="openDialog()">
        + สร้างเส้นทาง
      </ElButton>
    </div>

    <ElCard>
      <div class="toolbar">
        <ElInput v-model="crud.query.search" placeholder="ค้นหาชื่อ…" clearable style="max-width: 260px" />
      </div>

      <ElTable v-loading="crud.loading.value" :data="crud.items.value" @sort-change="crud.onSortChange">
        <ElTableColumn prop="id" label="ID" width="70" />
        <ElTableColumn prop="name" label="ชื่อ" min-width="200" sortable="custom">
          <template #default="{ row }">
            <ElLink type="primary" @click="openTrail(row)">{{ row.name }}</ElLink>
            <div v-if="row.description" class="hint">{{ row.description }}</div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="ร้าน" width="90" align="center">
          <template #default="{ row }">{{ row._count?.places ?? 0 }}</template>
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
            <ElButton size="small" type="primary" plain @click="openTrail(row)">ร้าน & เมนู</ElButton>
            <ElButton v-permission="PERMISSIONS.FOOD_TRAILS_MANAGE" size="small" @click="openDialog(row)">
              แก้ไข
            </ElButton>
            <ElButton
              v-permission="PERMISSIONS.FOOD_TRAILS_MANAGE"
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

    <ElDialog v-model="dialog" :title="isEdit ? 'แก้ไขเส้นทาง' : 'สร้างเส้นทาง'" width="480px">
      <ElForm label-position="top" @submit.prevent>
        <ElFormItem label="ชื่อ" required>
          <ElInput v-model="form.name" maxlength="200" placeholder="เช่น ตามรอยไทโอ กินตามน้อง" />
        </ElFormItem>
        <ElFormItem label="รายละเอียด">
          <ElInput
            v-model="form.description"
            type="textarea"
            :rows="3"
            maxlength="1000"
            placeholder="แสดงบนเว็บและบนรูปใต้ชื่อ (ไม่บังคับ)"
          />
        </ElFormItem>
        <ElFormItem label="ลำดับ">
          <ElInputNumber v-model="form.sortOrder" :step="1" />
        </ElFormItem>
        <ElFormItem>
          <ElCheckbox v-model="form.isActive">แสดงบนเว็บ</ElCheckbox>
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
