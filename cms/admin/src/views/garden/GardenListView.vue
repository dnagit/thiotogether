<script setup lang="ts">
/**
 * Sunflower gardens. Each row is one event, with the counts that decide whether it can open:
 * fertiliser bags to mix and flower designs to grow.
 */
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { http } from '@/api/http';
import { useCrud } from '@/composables/useCrud';
import { PERMISSIONS, slugify, type ApiResponse } from '@cms/shared';

const router = useRouter();
const crud = useCrud<any>({ endpoint: '/garden' });

const dialog = ref(false);
const blank = () => ({
  title: '',
  slug: '',
  themeColor: '#f59e0b',
  // Midnight in Bangkok on 20 September, the day every flower opens.
  revealAt: new Date('2027-09-20T00:00:00+07:00'),
});
const form = reactive(blank());
const saving = ref(false);

function openCreate(): void {
  Object.assign(form, blank());
  dialog.value = true;
}

const canSubmit = computed(() => form.title.trim().length > 0 && !!form.revealAt);

async function create(): Promise<void> {
  saving.value = true;
  try {
    const { data } = await http.post<ApiResponse<any>>('/garden', {
      ...form,
      slug: form.slug || slugify(form.title),
    });
    dialog.value = false;
    ElMessage.success('สร้างสวนแล้ว ขั้นต่อไปคือใส่ปุ๋ยและแบบดอกทานตะวัน');
    void router.push({ name: 'garden-edit', params: { id: data.data.id } });
  } finally {
    saving.value = false;
  }
}

/** Sowing stays closed without two bags to mix, so say so before anyone shares the link. */
function readiness(row: any): { ready: boolean; message: string } {
  const bags = row._count?.fertilizers ?? 0;
  const designs = row._count?.designs ?? 0;
  if (bags < 2) return { ready: false, message: `ปุ๋ย ${bags} ถุง` };
  if (designs === 0 || !row.defaultDesignId)
    return { ready: false, message: 'ยังไม่มีแบบดอกตั้งต้น' };
  return { ready: true, message: `ปุ๋ย ${bags} ถุง · ดอก ${designs} แบบ` };
}

const formatDate = (value: string) =>
  new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>สวนทานตะวัน</h1>
      <ElButton v-permission="PERMISSIONS.GARDEN_MANAGE" type="primary" @click="openCreate">
        + สร้างสวน
      </ElButton>
    </div>

    <ElCard>
      <div class="toolbar">
        <ElInput
          v-model="crud.query.search"
          placeholder="ค้นหาชื่อสวน…"
          clearable
          style="width: 240px"
        />
      </div>

      <ElTable v-loading="crud.loading.value" :data="crud.items.value">
        <ElTableColumn label="สวน" min-width="240">
          <template #default="{ row }">
            <b>{{ row.title }}</b>
            <div class="text-muted">/garden/{{ row.slug }}</div>
          </template>
        </ElTableColumn>

        <ElTableColumn label="ความพร้อม" width="200" align="center">
          <template #default="{ row }">
            <span :class="readiness(row).ready ? 'ok' : 'warn'">
              {{ readiness(row).ready ? '✓' : '⚠' }} {{ readiness(row).message }}
            </span>
          </template>
        </ElTableColumn>

        <ElTableColumn label="ต้นที่ปลูก" width="110" align="center">
          <template #default="{ row }">{{ row._count?.plants ?? 0 }}</template>
        </ElTableColumn>

        <ElTableColumn label="วันเปิดผล" width="190" align="center">
          <template #default="{ row }">
            <div>{{ formatDate(row.revealAt) }}</div>
            <ElTag v-if="row.revealed" size="small" type="success">บานแล้ว</ElTag>
          </template>
        </ElTableColumn>

        <ElTableColumn label="สถานะ" width="190" align="center">
          <template #default="{ row }">
            <ElTag size="small" :type="row.isActive ? 'success' : 'info'">
              {{ row.isActive ? 'เปิดใช้งาน' : 'ปิดอยู่' }}
            </ElTag>
            <ElTag
              size="small"
              class="ml"
              :type="row.isOpen && !row.revealed ? 'success' : 'warning'"
            >
              {{ row.isOpen && !row.revealed ? 'รับปลูก' : 'ปิดรับ' }}
            </ElTag>
          </template>
        </ElTableColumn>

        <ElTableColumn label="จัดการ" width="300" fixed="right">
          <template #default="{ row }">
            <ElButton
              size="small"
              @click="router.push({ name: 'garden-edit', params: { id: row.id } })"
            >
              ตั้งค่า
            </ElButton>
            <ElButton
              size="small"
              plain
              @click="router.push({ name: 'garden-plants', params: { id: row.id } })"
            >
              ต้นทานตะวัน
            </ElButton>
            <ElButton
              v-permission="PERMISSIONS.GARDEN_MANAGE"
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
        <div class="empty-icon">🌻</div>
        <p>ยังไม่มีสวน — กด "สร้างสวน" เพื่อเริ่ม</p>
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

    <ElDialog v-model="dialog" title="สร้างสวนทานตะวัน" width="520px">
      <ElForm label-position="top">
        <ElFormItem label="ชื่อสวน" required>
          <ElInput v-model="form.title" placeholder="เช่น สวนทานตะวันวันเกิดไทโอ" />
        </ElFormItem>
        <ElFormItem label="Slug (ใช้ใน URL)">
          <ElInput v-model="form.slug" :placeholder="slugify(form.title) || 'garden'" />
          <div class="hint text-muted">เว้นว่างไว้ระบบจะสร้างให้จากชื่อสวน</div>
        </ElFormItem>
        <ElFormItem label="วันและเวลาที่ทุกต้นบาน (เวลาในเครื่องนี้)" required>
          <ElDatePicker v-model="form.revealAt" type="datetime" style="width: 100%" />
          <div class="hint text-muted">ปิดรับการปลูกพร้อมกันในเวลานี้</div>
        </ElFormItem>
        <ElFormItem label="สีหลักของสวน">
          <ElColorPicker v-model="form.themeColor" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialog = false">ยกเลิก</ElButton>
        <ElButton type="primary" :disabled="!canSubmit" :loading="saving" @click="create"
          >สร้าง</ElButton
        >
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.mt {
  margin-top: 12px;
}
.ml {
  margin-left: 6px;
}
.hint {
  font-size: 12px;
  margin-top: 4px;
}
.ok {
  color: var(--el-color-success);
  font-weight: 600;
}
.warn {
  color: var(--el-color-warning);
  font-weight: 600;
}
.empty {
  padding: 32px 0;
  text-align: center;
}
.empty-icon {
  font-size: 40px;
  margin-bottom: 8px;
}
</style>
