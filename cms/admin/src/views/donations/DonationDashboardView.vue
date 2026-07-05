<script setup lang="ts">
import { ref } from 'vue';
import { http } from '@/api/http';
import { formatCurrency, type ApiResponse, type DonationDashboard } from '@cms/shared';

const data = ref<DonationDashboard | null>(null);
const loading = ref(true);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await http.get<ApiResponse<DonationDashboard>>('/donations/dashboard');
    data.value = res.data.data;
  } finally {
    loading.value = false;
  }
}
void load();
</script>

<template>
  <div v-loading="loading" class="page-container">
    <div class="page-header"><h1>Donation Dashboard</h1><ElButton text @click="load">↻ Refresh</ElButton></div>

    <template v-if="data">
      <ElRow :gutter="16">
        <ElCol v-for="card in [
            { label: 'Total Donations', value: data.totals.totalDonations.toLocaleString() },
            { label: 'Total Verified Amount', value: formatCurrency(data.totals.totalAmount) },
            { label: 'Pending', value: data.totals.pending + data.totals.needsReview },
            { label: 'Verified', value: data.totals.verified },
            { label: 'Rejected', value: data.totals.rejected },
          ]" :key="card.label" :xs="12" :sm="8" :md="4">
          <ElCard class="stat"><div class="stat-value">{{ card.value }}</div><div class="text-muted">{{ card.label }}</div></ElCard>
        </ElCol>
      </ElRow>

      <ElCard class="mt" header="Per Project">
        <ElTable :data="data.perProject">
          <ElTableColumn label="Project" min-width="200">
            <template #default="{ row }"><b>{{ row.project.name }}</b></template>
          </ElTableColumn>
          <ElTableColumn label="Progress" min-width="220">
            <template #default="{ row }">
              <ElProgress :percentage="row.progressPercent" />
              <span class="text-muted">{{ formatCurrency(row.currentAmount, row.project.currency) }} / {{ formatCurrency(row.targetAmount, row.project.currency) }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="Remaining" width="140" align="right">
            <template #default="{ row }">{{ formatCurrency(row.remainingAmount, row.project.currency) }}</template>
          </ElTableColumn>
          <ElTableColumn prop="donorCount" label="Donors" width="90" align="center" />
          <ElTableColumn prop="pendingCount" label="Pending" width="90" align="center" />
          <ElTableColumn prop="verifiedCount" label="Verified" width="90" align="center" />
          <ElTableColumn prop="rejectedCount" label="Rejected" width="90" align="center" />
        </ElTable>
      </ElCard>
    </template>
  </div>
</template>

<style scoped>
.stat { text-align: center; }
.stat-value { font-size: 22px; font-weight: 700; }
.mt { margin-top: 16px; }
</style>
