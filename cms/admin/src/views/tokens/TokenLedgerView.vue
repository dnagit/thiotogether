<script setup lang="ts">
/** Global append-only token ledger. Read-only by design — history is never edited. */
import { ref } from 'vue';
import { http } from '@/api/http';
import { useCrud } from '@/composables/useCrud';
import { tagMapper } from '@/utils/elementTypes';
import { formatDateTime, type ApiResponse } from '@cms/shared';

const crud = useCrud<any>({ endpoint: '/tokens/ledger' });
const projects = ref<any[]>([]);
void http
  .get<ApiResponse<any[]>>('/donation-projects', { params: { limit: 100 } })
  .then(({ data }) => (projects.value = data.data));

const reasonTag = tagMapper({
  GRANT: 'success', SPEND: 'warning', REFUND: 'primary', REVOKE: 'danger', ADJUST: 'info',
});
const reasonLabel: Record<string, string> = {
  GRANT: 'ได้รับ', SPEND: 'ใช้ไป', REFUND: 'คืน', REVOKE: 'ยกเลิก', ADJUST: 'ปรับโดยแอดมิน',
};
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>Token Ledger</h1>
    </div>

    <ElAlert
      type="info" show-icon :closable="false" class="mb"
      title="ประวัติแบบ Append-only"
      description="ทุกการเพิ่มและหัก token ถูกบันทึกที่นี่และแก้ไขไม่ได้ ใช้ตรวจสอบย้อนหลังได้เสมอ"
    />

    <ElCard>
      <div class="toolbar">
        <ElInput v-model="crud.query.search" placeholder="ค้นหาชื่อบัญชี…" clearable style="width: 240px" />
        <ElSelect v-model="crud.query.filters.reason" placeholder="ประเภท" clearable style="width: 180px">
          <ElOption v-for="r in ['GRANT', 'SPEND', 'REFUND', 'REVOKE', 'ADJUST']" :key="r" :value="r" :label="reasonLabel[r]" />
        </ElSelect>
        <ElSelect v-model="crud.query.filters.projectId" placeholder="โครงการ" clearable filterable style="width: 220px">
          <ElOption v-for="p in projects" :key="p.id" :value="String(p.id)" :label="p.name" />
        </ElSelect>
      </div>

      <ElTable v-loading="crud.loading.value" :data="crud.items.value">
        <ElTableColumn label="เวลา" width="160">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </ElTableColumn>
        <ElTableColumn label="บัญชี" min-width="160">
          <template #default="{ row }">{{ row.accountIdentity.displayName }}</template>
        </ElTableColumn>
        <ElTableColumn label="ประเภท" width="140">
          <template #default="{ row }">
            <ElTag size="small" :type="reasonTag(row.reason)">{{ reasonLabel[row.reason] ?? row.reason }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="จำนวน" width="100" align="right">
          <template #default="{ row }">
            <!-- Sign carries the meaning, not just the colour. -->
            <b :class="row.delta > 0 ? 'pos' : 'neg'">{{ row.delta > 0 ? '+' : '' }}{{ row.delta }}</b>
          </template>
        </ElTableColumn>
        <ElTableColumn label="โครงการ" min-width="150">
          <template #default="{ row }">{{ row.project?.name ?? '—' }}</template>
        </ElTableColumn>
        <ElTableColumn label="รายละเอียด" min-width="240">
          <template #default="{ row }">
            {{ row.description ?? '—' }}
            <span v-if="row.actor" class="text-muted"> · โดย {{ row.actor.name }}</span>
          </template>
        </ElTableColumn>
        <template #empty><div class="empty">ยังไม่มีรายการใน ledger</div></template>
      </ElTable>

      <ElPagination
        v-model:current-page="crud.query.page"
        class="mt" layout="prev, pager, next, total"
        :total="crud.meta.value.total" :page-size="crud.query.limit"
      />
    </ElCard>
  </div>
</template>

<style scoped>
.mb { margin-bottom: 12px; }
.mt { margin-top: 12px; }
.pos { color: var(--el-color-success); }
.neg { color: var(--el-color-danger); }
.empty { padding: 32px; text-align: center; color: var(--el-text-color-secondary); }
</style>
