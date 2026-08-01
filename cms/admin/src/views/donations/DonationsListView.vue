<script setup lang="ts">
import { tagMapper } from '@/utils/elementTypes';
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { http } from '@/api/http';
import { useCrud } from '@/composables/useCrud';
import {
  formatCurrency, formatDate, formatDateTime,
  PERMISSIONS, type ApiResponse,
} from '@cms/shared';

const route = useRoute();
const crud = useCrud<any>({ endpoint: '/donations' });
if (route.query.status) crud.query.filters.status = String(route.query.status);
if (route.query.search) crud.query.search = String(route.query.search);

const projects = ref<any[]>([]);
void http
  .get<ApiResponse<any[]>>('/donation-projects', { params: { limit: 100 } })
  .then(({ data }) => (projects.value = data.data));

const statusTag = tagMapper({
  VERIFIED: 'success', AUTO_VERIFIED: 'success', PENDING: 'warning',
  NEEDS_REVIEW: 'danger', REJECTED: 'info', CANCELLED: 'info',
});

/**
 * Tint each row by status. The Status column is the last one before the actions, so on a tablet
 * it sits outside the visible width and the table has to be scrolled to answer "what needs my
 * attention" — the row colour carries that answer without scrolling.
 */
function rowClass({ row }: { row: any }): string {
  return `status-row status-${String(row.status).toLowerCase()}`;
}

// ── Detail drawer ───────────────────────────────────────────
const drawer = ref(false);
const detail = ref<any | null>(null);
const logs = ref<any[]>([]);
const acting = ref(false);

async function openDetail(row: any): Promise<void> {
  const [{ data: d }, { data: l }] = await Promise.all([
    http.get<ApiResponse<any>>(`/donations/${row.id}`),
    http.get<ApiResponse<any[]>>(`/donations/${row.id}/logs`),
  ]);
  detail.value = d.data;
  logs.value = l.data;
  drawer.value = true;
}

async function verify(): Promise<void> {
  acting.value = true;
  try {
    await http.post(`/donations/${detail.value.id}/verify`, {});
    ElMessage.success('Donation verified');
    drawer.value = false;
    await crud.fetchList();
  } finally {
    acting.value = false;
  }
}

async function reject(): Promise<void> {
  let reason: string;
  try {
    const res = await ElMessageBox.prompt('ระบุเหตุผลที่ปฏิเสธรายการนี้', 'ปฏิเสธการบริจาค', {
      inputValidator: (v: string) => (v?.trim() ? true : 'กรุณาระบุเหตุผล'),
      confirmButtonText: 'ปฏิเสธ',
      cancelButtonText: 'ยกเลิก',
      // `confirmButtonType`, not `confirmButtonClass` — see utils/confirm.ts.
      confirmButtonType: 'danger',
    });
    reason = res.value;
  } catch {
    return;
  }
  acting.value = true;
  try {
    await http.post(`/donations/${detail.value.id}/reject`, { reason });
    ElMessage.success('Donation rejected');
    drawer.value = false;
    await crud.fetchList();
  } finally {
    acting.value = false;
  }
}

function exportFile(format: 'csv' | 'xlsx'): void {
  const params = new URLSearchParams({ format });
  if (crud.query.search) params.set('search', crud.query.search);
  for (const [k, v] of Object.entries(crud.query.filters)) if (v) params.set(k, String(v));
  // Token travels via interceptor only on XHR — use fetch + blob for download.
  void http
    .get(`/donations/export?${params}`, { responseType: 'blob' })
    .then((res) => {
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `donations.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    });
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>Donations</h1>
      <div>
        <ElButton v-permission="PERMISSIONS.DONATIONS_EXPORT" @click="exportFile('csv')">Export CSV</ElButton>
        <ElButton v-permission="PERMISSIONS.DONATIONS_EXPORT" @click="exportFile('xlsx')">Export Excel</ElButton>
      </div>
    </div>

    <ElCard>
      <div class="toolbar">
        <ElInput v-model="crud.query.search" placeholder="Search code / donor…" clearable style="width: 220px" />
        <ElSelect v-model="crud.query.filters.projectId" placeholder="Project" clearable filterable style="width: 220px">
          <ElOption v-for="p in projects" :key="p.id" :value="String(p.id)" :label="p.name" />
        </ElSelect>
        <ElSelect v-model="crud.query.filters.status" placeholder="Status" clearable style="width: 180px">
          <ElOption v-for="s in ['PENDING', 'AUTO_VERIFIED', 'VERIFIED', 'NEEDS_REVIEW', 'REJECTED']" :key="s" :value="s" :label="s" />
        </ElSelect>
      </div>

      <ElTable
        v-loading="crud.loading.value"
        :data="crud.items.value"
        :row-class-name="rowClass"
        @sort-change="crud.onSortChange"
      >
        <ElTableColumn prop="donationCode" label="Code" width="140" />
        <ElTableColumn label="Project" min-width="160">
          <template #default="{ row }">{{ row.project?.name }}</template>
        </ElTableColumn>
        <ElTableColumn prop="accountName" label="Donor" min-width="140" />
        <ElTableColumn prop="amount" label="Amount" width="130" align="right" sortable="custom">
          <template #default="{ row }">{{ formatCurrency(Number(row.amount), row.project?.currency) }}</template>
        </ElTableColumn>
        <ElTableColumn label="Transfer" width="150">
          <template #default="{ row }">{{ formatDate(row.transferDate) }} {{ row.transferTime }}</template>
        </ElTableColumn>
        <ElTableColumn label="OCR" width="90" align="center">
          <template #default="{ row }">
            <ElTooltip v-if="row.verification" :content="`Confidence ${(row.verification.confidence * 100).toFixed(0)}% · amount ${row.verification.amountMatched ? '✓' : '✗'}`">
              <span>{{ row.verification.isSlip ? '🧾' : '❔' }} {{ (row.verification.confidence * 100).toFixed(0) }}%</span>
            </ElTooltip>
            <span v-else class="text-muted">—</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="Status" width="140">
          <template #default="{ row }"><ElTag size="small" :type="statusTag(row.status)">{{ row.status }}</ElTag></template>
        </ElTableColumn>
        <ElTableColumn label="" width="100" fixed="right">
          <template #default="{ row }"><ElButton size="small" @click="openDetail(row)">Review</ElButton></template>
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

    <!-- Review drawer -->
    <ElDrawer v-model="drawer" title="Donation Review" size="640px">
      <template v-if="detail">
        <ElRow :gutter="16">
          <ElCol :span="12">
            <h4>Transfer Slip</h4>
            <ElImage :src="detail.slipUrl" fit="contain" style="width: 100%; max-height: 420px" :preview-src-list="[detail.slipUrl]" />
          </ElCol>
          <ElCol :span="12">
            <h4>Declared by Donor</h4>
            <ElDescriptions :column="1" border size="small">
              <ElDescriptionsItem label="Code">{{ detail.donationCode }}</ElDescriptionsItem>
              <ElDescriptionsItem label="Project">{{ detail.project?.name }}</ElDescriptionsItem>
              <ElDescriptionsItem label="Nickname">{{ detail.nickname ?? '—' }}</ElDescriptionsItem>
              <ElDescriptionsItem label="Donor">{{ detail.accountName }}</ElDescriptionsItem>
              <ElDescriptionsItem label="Name / Address / Phone">
                <span style="white-space: pre-wrap">{{ detail.contactInfo ?? '—' }}</span>
              </ElDescriptionsItem>
              <ElDescriptionsItem label="Amount">{{ formatCurrency(Number(detail.amount), detail.project?.currency) }}</ElDescriptionsItem>
              <ElDescriptionsItem label="Transfer">{{ formatDate(detail.transferDate) }} {{ detail.transferTime }}</ElDescriptionsItem>
              <ElDescriptionsItem label="Remark">{{ detail.remark ?? '—' }}</ElDescriptionsItem>
              <ElDescriptionsItem label="Status"><ElTag :type="statusTag(detail.status)">{{ detail.status }}</ElTag></ElDescriptionsItem>
            </ElDescriptions>

            <template v-if="detail.verification">
              <h4 class="mt">OCR Extraction ({{ detail.verification.provider }})</h4>
              <ElDescriptions :column="1" border size="small">
                <ElDescriptionsItem label="Looks like a slip">{{ detail.verification.isSlip ? 'Yes 🧾' : 'No ⚠️' }}</ElDescriptionsItem>
                <ElDescriptionsItem label="Confidence">{{ (detail.verification.confidence * 100).toFixed(1) }}%</ElDescriptionsItem>
                <ElDescriptionsItem label="Bank">{{ detail.verification.extractedBankName ?? '—' }}</ElDescriptionsItem>
                <ElDescriptionsItem label="Account #">{{ detail.verification.extractedAccountNumber ?? '—' }}</ElDescriptionsItem>
                <ElDescriptionsItem label="Amount">
                  {{ detail.verification.extractedAmount ?? '—' }}
                  <ElTag size="small" :type="detail.verification.amountMatched ? 'success' : 'danger'">
                    {{ detail.verification.amountMatched ? 'matches' : 'mismatch' }}
                  </ElTag>
                </ElDescriptionsItem>
                <ElDescriptionsItem label="Date / Time">
                  {{ detail.verification.extractedDate ?? '—' }} {{ detail.verification.extractedTime ?? '' }}
                  <ElTag size="small" :type="detail.verification.dateMatched ? 'success' : 'warning'">
                    {{ detail.verification.dateMatched ? 'matches' : 'unconfirmed' }}
                  </ElTag>
                </ElDescriptionsItem>
                <ElDescriptionsItem label="Reference">{{ detail.verification.referenceNumber ?? '—' }}</ElDescriptionsItem>
              </ElDescriptions>
            </template>
          </ElCol>
        </ElRow>

        <h4 class="mt">History</h4>
        <ElTimeline>
          <ElTimelineItem v-for="log in logs" :key="log.id" :timestamp="formatDateTime(log.createdAt)">
            <b>{{ log.actor?.name ?? 'System' }}</b>
            {{ log.action }}<template v-if="log.toStatus"> → {{ log.toStatus }}</template>
            <div v-if="log.note" class="text-muted">{{ log.note }}</div>
          </ElTimelineItem>
        </ElTimeline>

        <div v-permission="PERMISSIONS.DONATIONS_VERIFY" class="actions">
          <ElButton
            type="success"
            :loading="acting"
            :disabled="detail.status === 'VERIFIED'"
            @click="verify"
          >✓ Approve & Verify</ElButton>
          <ElButton
            type="danger"
            plain
            :loading="acting"
            :disabled="detail.status === 'REJECTED'"
            @click="reject"
          >✗ Reject</ElButton>
        </div>
      </template>
    </ElDrawer>
  </div>
</template>

<style scoped>
.mt { margin-top: 16px; }
.actions { margin-top: 20px; display: flex; gap: 8px; }

/**
 * Row tinting by status.
 *
 * Driving `--el-table-tr-bg-color` rather than setting `background` keeps Element Plus in charge
 * of hover and of the fixed actions column, which paint themselves from their own variables — a
 * hard-coded background would leave the frozen column the wrong colour on a narrow screen.
 * The palette comes from Element Plus tokens, so the tints follow the dark theme too.
 */
:deep(.el-table__row.status-verified),
:deep(.el-table__row.status-auto_verified) {
  --status-accent: var(--el-color-success);
  --el-table-tr-bg-color: var(--el-color-success-light-9);
}
:deep(.el-table__row.status-pending) {
  --status-accent: var(--el-color-warning);
  --el-table-tr-bg-color: var(--el-color-warning-light-9);
}
:deep(.el-table__row.status-needs_review) {
  --status-accent: var(--el-color-danger);
  --el-table-tr-bg-color: var(--el-color-danger-light-9);
}
:deep(.el-table__row.status-rejected),
:deep(.el-table__row.status-cancelled) {
  --status-accent: var(--el-color-info);
  --el-table-tr-bg-color: var(--el-color-info-light-9);
}

/* A colour-only signal fails for colour-blind users and in bright sunlight, so the tint is
   doubled with a solid bar down the leading edge of the row. */
:deep(.el-table__row.status-row > td:first-child) {
  box-shadow: inset 3px 0 0 var(--status-accent);
}
</style>
