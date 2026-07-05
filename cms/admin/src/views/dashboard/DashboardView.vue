<script setup lang="ts">
import { ref } from 'vue';
import { http } from '@/api/http';
import { formatCurrency, formatDateTime, progressPercent, type ApiResponse, type DashboardStats } from '@cms/shared';

const stats = ref<DashboardStats | null>(null);
const loading = ref(true);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const { data } = await http.get<ApiResponse<DashboardStats>>('/dashboard');
    stats.value = data.data;
  } finally {
    loading.value = false;
  }
}
void load();

const statusTag = (s: string) =>
  ({ VERIFIED: 'success', AUTO_VERIFIED: 'success', PENDING: 'warning', NEEDS_REVIEW: 'danger', REJECTED: 'info' })[s] ?? 'info';
</script>

<template>
  <div v-loading="loading" class="page-container">
    <div class="page-header"><h1>Dashboard</h1><ElButton text @click="load">↻ Refresh</ElButton></div>

    <template v-if="stats">
      <ElRow :gutter="16">
        <ElCol v-for="card in [
            { label: 'Total Pages', value: stats.totalPages, icon: '📄' },
            { label: 'Total Donations', value: stats.totalDonations, icon: '💰' },
            { label: 'Pending Donations', value: stats.pendingDonations, icon: '⏳' },
            { label: 'Total Visitors', value: stats.totalVisitors, icon: '👥' },
          ]" :key="card.label" :xs="12" :sm="6">
          <ElCard class="stat-card">
            <div class="stat-icon">{{ card.icon }}</div>
            <div class="stat-value">{{ card.value.toLocaleString() }}</div>
            <div class="text-muted">{{ card.label }}</div>
          </ElCard>
        </ElCol>
      </ElRow>

      <ElRow :gutter="16" class="mt">
        <ElCol :xs="24" :md="12">
          <ElCard header="Active Campaigns">
            <div v-for="p in stats.activeProjects" :key="p.id" class="project-row">
              <div class="project-name">{{ p.name }}</div>
              <ElProgress
                :percentage="progressPercent(Number(p.currentAmount), Number(p.targetAmount))"
                :stroke-width="10"
              />
              <div class="text-muted">
                {{ formatCurrency(Number(p.currentAmount)) }} / {{ formatCurrency(Number(p.targetAmount)) }}
              </div>
            </div>
            <ElEmpty v-if="!stats.activeProjects.length" description="No active campaigns" />
          </ElCard>

          <ElCard header="System Status" class="mt">
            <ElDescriptions :column="2" border size="small">
              <ElDescriptionsItem label="Database">
                <ElTag :type="stats.systemStatus.db === 'ok' ? 'success' : 'danger'">{{ stats.systemStatus.db }}</ElTag>
              </ElDescriptionsItem>
              <ElDescriptionsItem label="Storage">
                <ElTag :type="stats.systemStatus.storage === 'ok' ? 'success' : 'danger'">{{ stats.systemStatus.storage }}</ElTag>
              </ElDescriptionsItem>
              <ElDescriptionsItem label="Uptime">{{ Math.floor(stats.systemStatus.uptimeSeconds / 3600) }}h {{ Math.floor((stats.systemStatus.uptimeSeconds % 3600) / 60) }}m</ElDescriptionsItem>
              <ElDescriptionsItem label="Memory">{{ stats.systemStatus.memoryUsageMb }} MB</ElDescriptionsItem>
              <ElDescriptionsItem label="Node">{{ stats.systemStatus.nodeVersion }}</ElDescriptionsItem>
            </ElDescriptions>
          </ElCard>
        </ElCol>

        <ElCol :xs="24" :md="12">
          <ElCard header="Recent Donations">
            <ElTable :data="stats.recentDonations" size="small">
              <ElTableColumn prop="donationCode" label="Code" width="130" />
              <ElTableColumn prop="accountName" label="Donor" />
              <ElTableColumn label="Amount" width="110" align="right">
                <template #default="{ row }">{{ formatCurrency(Number(row.amount), row.project?.currency) }}</template>
              </ElTableColumn>
              <ElTableColumn label="Status" width="130">
                <template #default="{ row }"><ElTag size="small" :type="statusTag(row.status)">{{ row.status }}</ElTag></template>
              </ElTableColumn>
            </ElTable>
          </ElCard>

          <ElCard header="Recent Pages" class="mt">
            <ElTable :data="stats.recentPages" size="small">
              <ElTableColumn prop="title" label="Title" />
              <ElTableColumn prop="path" label="Path" />
              <ElTableColumn label="Updated" width="150">
                <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
              </ElTableColumn>
            </ElTable>
          </ElCard>

          <ElCard header="Recent Activity" class="mt">
            <ElTimeline>
              <ElTimelineItem
                v-for="a in stats.recentActivities"
                :key="a.id"
                :timestamp="formatDateTime(a.createdAt)"
                size="small"
              >
                <b>{{ a.userName }}</b> — {{ a.action }} {{ a.resource }}<span v-if="a.resourceId"> #{{ a.resourceId }}</span>
              </ElTimelineItem>
            </ElTimeline>
          </ElCard>
        </ElCol>
      </ElRow>
    </template>
  </div>
</template>

<style scoped>
.stat-card { text-align: center; }
.stat-icon { font-size: 24px; }
.stat-value { font-size: 26px; font-weight: 700; }
.mt { margin-top: 16px; }
.project-row { margin-bottom: 14px; }
.project-name { font-weight: 600; margin-bottom: 4px; }
</style>
