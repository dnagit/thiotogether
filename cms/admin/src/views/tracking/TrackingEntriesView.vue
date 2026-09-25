<script setup lang="ts">
/**
 * One tracking project's numbers: an X account and a tracking number per row.
 *
 * Numbers usually arrive as a spreadsheet, so besides adding them one at a time there is a
 * paste box that takes two columns straight from Excel or Google Sheets — or a comma, or a
 * space, between the account and the number.
 */
import { computed, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { http } from '@/api/http';
import { useCrud } from '@/composables/useCrud';
import {
  PERMISSIONS,
  type ApiResponse,
  type TrackingBulkResult,
  type TrackingEntry,
  type TrackingProject,
} from '@cms/shared';

const route = useRoute();
const projectId = Number(route.params.id);

const project = ref<TrackingProject | null>(null);
async function loadProject(): Promise<void> {
  const { data } = await http.get<ApiResponse<TrackingProject>>(`/tracking/projects/${projectId}`);
  project.value = data.data;
}
void loadProject();

const crud = useCrud<TrackingEntry>({ endpoint: '/tracking/entries', params: { projectId } });

/** The "@" goes in front on screen; the API stores the name without it. */
const stripAt = (s: string) => s.trim().replace(/^@+/, '').trim();

// ── One at a time ─────────────────────────────────────────────────────────────
const dialog = ref(false);
const blank = { id: null as number | null, xAccount: '', trackingNo: '' };
const form = reactive({ ...blank });
const isEdit = computed(() => form.id !== null);
const canSave = computed(() => stripAt(form.xAccount).length > 0 && form.trackingNo.trim().length > 0);

function openDialog(row?: TrackingEntry | Record<string, any>): void {
  Object.assign(form, blank, row ? { id: row.id, xAccount: row.xAccount, trackingNo: row.trackingNo } : {});
  dialog.value = true;
}

async function save(): Promise<void> {
  const payload = { projectId, xAccount: stripAt(form.xAccount), trackingNo: form.trackingNo.trim() };
  if (form.id) await crud.updateItem(form.id, payload);
  else await crud.createItem(payload);
  dialog.value = false;
  void loadProject();
}

async function remove(row: TrackingEntry | Record<string, any>): Promise<void> {
  if (await crud.deleteItem(row.id, `@${row.xAccount} · ${row.trackingNo}`)) void loadProject();
}

// ── Paste many ────────────────────────────────────────────────────────────────
const bulkOpen = ref(false);
const bulkText = ref('');
const bulkSaving = ref(false);

/**
 * One row per line: the account, then the number. A tab (a spreadsheet's columns) or a comma
 * splits them; failing both, the first space does. Blank lines are skipped, and a first line
 * that reads like column headings is taken for one.
 */
const bulkParsed = computed(() => {
  const rows: Array<{ xAccount: string; trackingNo: string }> = [];
  const bad: string[] = [];
  bulkText.value.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    let parts = line.includes('\t') ? line.split('\t') : line.includes(',') ? line.split(',') : [];
    if (!parts.length) {
      const m = line.match(/^(\S+)\s+(.+)$/);
      parts = m ? [m[1], m[2]] : [line];
    }
    const xAccount = stripAt(parts[0] ?? '');
    const trackingNo = (parts[1] ?? '').trim();
    if (i === 0 && /account|แอค|บัญชี|ชื่อ/i.test(xAccount) && /track|เลข/i.test(trackingNo)) return;
    if (!xAccount || !trackingNo || xAccount.length > 100 || trackingNo.length > 100) bad.push(line);
    else rows.push({ xAccount, trackingNo });
  });
  return { rows, bad };
});

function openBulk(): void {
  bulkText.value = '';
  bulkOpen.value = true;
}

async function saveBulk(): Promise<void> {
  bulkSaving.value = true;
  try {
    const { data } = await http.post<ApiResponse<TrackingBulkResult>>('/tracking/entries/bulk', {
      projectId,
      rows: bulkParsed.value.rows,
    });
    ElMessage.success(data.message ?? `เพิ่ม ${data.data.created} รายการแล้ว`);
    bulkOpen.value = false;
    await crud.fetchList();
    void loadProject();
  } finally {
    bulkSaving.value = false;
  }
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <div>
        <ElButton text @click="$router.push({ name: 'tracking' })">← Tracking</ElButton>
        <h1>{{ project?.name ?? '…' }}</h1>
        <div v-if="project" class="hint">
          Project ID {{ project.id }} · {{ project._count?.entries ?? 0 }} รายการ ·
          {{ project.isActive ? 'ค้นหาบนเว็บได้' : 'ซ่อนจากเว็บอยู่' }}
        </div>
      </div>
      <div class="actions">
        <ElButton v-permission="PERMISSIONS.TRACKING_MANAGE" @click="openBulk">วางหลายรายการ</ElButton>
        <ElButton v-permission="PERMISSIONS.TRACKING_MANAGE" type="primary" @click="openDialog()">
          + เพิ่ม Tracking
        </ElButton>
      </div>
    </div>

    <ElCard>
      <div class="toolbar">
        <ElInput
          v-model="crud.query.search"
          placeholder="ค้นหา account X / tracking no…"
          clearable
          style="max-width: 280px"
        />
      </div>

      <ElTable v-loading="crud.loading.value" :data="crud.items.value" @sort-change="crud.onSortChange">
        <ElTableColumn prop="xAccount" label="Account X" min-width="180" sortable="custom">
          <template #default="{ row }">@{{ row.xAccount }}</template>
        </ElTableColumn>
        <ElTableColumn prop="trackingNo" label="Tracking No." min-width="200" sortable="custom">
          <template #default="{ row }"><span class="mono">{{ row.trackingNo }}</span></template>
        </ElTableColumn>
        <ElTableColumn label="จัดการ" width="150" fixed="right">
          <template #default="{ row }">
            <ElButton v-permission="PERMISSIONS.TRACKING_MANAGE" size="small" @click="openDialog(row)">
              แก้ไข
            </ElButton>
            <ElButton
              v-permission="PERMISSIONS.TRACKING_MANAGE"
              size="small"
              type="danger"
              text
              @click="remove(row)"
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

    <ElDialog v-model="dialog" :title="isEdit ? 'แก้ไข Tracking' : 'เพิ่ม Tracking'" width="440px">
      <ElForm label-position="top" @submit.prevent="canSave && save()">
        <ElFormItem label="Account X" required>
          <ElInput v-model="form.xAccount" maxlength="101" placeholder="เช่น thio_together">
            <template #prepend>@</template>
          </ElInput>
        </ElFormItem>
        <ElFormItem label="Tracking No." required>
          <ElInput v-model="form.trackingNo" maxlength="100" placeholder="เช่น EF123456789TH" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialog = false">ยกเลิก</ElButton>
        <ElButton type="primary" :loading="crud.saving.value" :disabled="!canSave" @click="save">
          บันทึก
        </ElButton>
      </template>
    </ElDialog>

    <ElDialog v-model="bulkOpen" title="วางหลายรายการ" width="560px">
      <p class="hint">
        บรรทัดละ 1 รายการ: account X แล้วตามด้วย tracking no. — copy 2 คอลัมน์จาก Excel / Google Sheets
        มาวางได้เลย หรือคั่นด้วยจุลภาค (,) หรือเว้นวรรค
      </p>
      <ElInput
        v-model="bulkText"
        type="textarea"
        :rows="10"
        class="mono"
        placeholder="@thio_together, EF123456789TH&#10;fan_account, TH0123456789"
      />
      <div class="mt">
        <ElTag type="success">พร้อมเพิ่ม {{ bulkParsed.rows.length }} รายการ</ElTag>
        <ElTag v-if="bulkParsed.bad.length" type="danger" class="ml">
          อ่านไม่ได้ {{ bulkParsed.bad.length }} บรรทัด (จะข้ามไป)
        </ElTag>
      </div>
      <ul v-if="bulkParsed.bad.length" class="bad">
        <li v-for="(line, i) in bulkParsed.bad.slice(0, 5)" :key="i">{{ line }}</li>
      </ul>
      <template #footer>
        <ElButton @click="bulkOpen = false">ยกเลิก</ElButton>
        <ElButton
          type="primary"
          :loading="bulkSaving"
          :disabled="!bulkParsed.rows.length"
          @click="saveBulk"
        >
          เพิ่ม {{ bulkParsed.rows.length }} รายการ
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.mt { margin-top: 12px; }
.ml { margin-left: 8px; }
.hint { font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.5; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.mono, .mono :deep(textarea) { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.bad { margin: 8px 0 0; padding-left: 18px; font-size: 12px; color: var(--el-color-danger); }
</style>
