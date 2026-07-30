<script setup lang="ts">
/** Result table for one game, plus CSV export. Rewards stay masked until reveal. */
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { http } from '@/api/http';
import { formatDateTime, PERMISSIONS, type ApiResponse } from '@cms/shared';

const route = useRoute();
const router = useRouter();
const gameId = Number(route.params.id);

const data = ref<any>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const search = ref('');

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const { data: r } = await http.get<ApiResponse<any>>(`/games/${gameId}/results`);
    data.value = r.data;
  } catch (err: any) {
    error.value = err?.response?.data?.message ?? 'โหลดผลไม่สำเร็จ';
  } finally {
    loading.value = false;
  }
}
void load();

const revealed = computed(() => data.value?.game?.status === 'REVEALED');
const rows = computed(() => {
  const all = data.value?.rows ?? [];
  const q = search.value.trim().toLowerCase();
  if (!q) return all;
  return all.filter(
    (r: any) =>
      String(r.boardNumber).includes(q) ||
      r.reservedBy.toLowerCase().includes(q) ||
      r.reward.toLowerCase().includes(q),
  );
});
const reservedCount = computed(
  () => (data.value?.rows ?? []).filter((r: any) => r.reservedBy).length,
);

function exportCsv(): void {
  void http
    .get(`/games/${gameId}/results?format=csv`, { responseType: 'blob' })
    .then((res) => {
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `game-${data.value?.game?.slug ?? gameId}-results.csv`;
      a.click();
      URL.revokeObjectURL(url);
    })
    .catch(() => ElMessage.error('ดาวน์โหลดไม่สำเร็จ'));
}
</script>

<template>
  <div class="page-container">
    <div v-if="loading" v-loading="true" class="loading-block" />

    <ElResult v-else-if="error" icon="error" :title="error">
      <template #extra><ElButton type="primary" @click="load">ลองใหม่</ElButton></template>
    </ElResult>

    <template v-else-if="data">
      <div class="page-header">
        <div>
          <ElButton link @click="router.push({ name: 'games' })">← กลับ</ElButton>
          <h1>ผลเกม: {{ data.game.name }}</h1>
          <div class="text-muted">จองแล้ว {{ reservedCount }} จาก {{ data.rows.length }} ป้าย</div>
        </div>
        <ElButton v-permission="PERMISSIONS.GAMES_VIEW" @click="exportCsv">Export CSV</ElButton>
      </div>

      <ElAlert
        v-if="!revealed"
        type="info" show-icon :closable="false" class="mb"
        title="เกมนี้ยังไม่เฉลย"
        description="ช่องรางวัลจะแสดงเป็น (ยังไม่เฉลย) ทั้งในตารางและไฟล์ CSV เพื่อไม่ให้ผลรั่วก่อนเวลา"
      />

      <ElCard>
        <div class="toolbar">
          <ElInput v-model="search" placeholder="ค้นหาเลขป้าย / ชื่อผู้จอง / รางวัล…" clearable style="width: 320px" />
        </div>

        <ElTable :data="rows" max-height="640" stripe>
          <ElTableColumn label="ป้าย" width="90" align="center">
            <template #default="{ row }"><b>#{{ row.boardNumber }}</b></template>
          </ElTableColumn>
          <ElTableColumn label="ผู้จอง" min-width="180">
            <template #default="{ row }">
              <span v-if="row.reservedBy">{{ row.reservedBy }}</span>
              <span v-else class="text-muted">— ยังไม่มีผู้จอง —</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="เวลาที่จอง" width="180">
            <template #default="{ row }">
              {{ row.reservedAt ? formatDateTime(row.reservedAt) : '—' }}
            </template>
          </ElTableColumn>
          <ElTableColumn label="รางวัล" min-width="220">
            <template #default="{ row }">
              <span :class="{ masked: !revealed }">{{ row.reward }}</span>
            </template>
          </ElTableColumn>
          <template #empty><div class="empty">ไม่พบรายการที่ตรงกับคำค้น</div></template>
        </ElTable>
      </ElCard>
    </template>
  </div>
</template>

<style scoped>
.mb { margin-bottom: 12px; }
.loading-block { min-height: 320px; }
.empty { padding: 32px; text-align: center; color: var(--el-text-color-secondary); }
.masked { color: var(--el-text-color-secondary); font-style: italic; }
</style>
