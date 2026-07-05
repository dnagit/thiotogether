<script setup lang="ts">
import { useCrud } from '@/composables/useCrud';
import { formatDateTime } from '@cms/shared';

const crud = useCrud<any>({ endpoint: '/audit-logs' });

const actionTag = (a: string) =>
  ({ create: 'success', update: 'warning', delete: 'danger', login: 'info' })[a] ?? 'info';
</script>

<template>
  <div class="page-container">
    <div class="page-header"><h1>Audit Logs</h1></div>

    <ElCard>
      <div class="toolbar">
        <ElSelect v-model="crud.query.filters.resource" placeholder="Resource" clearable style="width: 180px">
          <ElOption v-for="r in ['pages', 'menus', 'forms', 'donations', 'donation-projects', 'bank-accounts', 'media', 'users', 'roles', 'settings']" :key="r" :value="r" :label="r" />
        </ElSelect>
        <ElSelect v-model="crud.query.filters.action" placeholder="Action" clearable style="width: 140px">
          <ElOption v-for="a in ['create', 'update', 'delete']" :key="a" :value="a" :label="a" />
        </ElSelect>
      </div>

      <ElTable v-loading="crud.loading.value" :data="crud.items.value" stripe>
        <ElTableColumn label="Time" width="170">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </ElTableColumn>
        <ElTableColumn label="User" width="180">
          <template #default="{ row }">{{ row.user?.name ?? 'System' }}</template>
        </ElTableColumn>
        <ElTableColumn label="Action" width="110">
          <template #default="{ row }"><ElTag size="small" :type="actionTag(row.action)">{{ row.action }}</ElTag></template>
        </ElTableColumn>
        <ElTableColumn prop="resource" label="Resource" width="150" />
        <ElTableColumn prop="resourceId" label="ID" width="80" />
        <ElTableColumn label="Detail" min-width="240">
          <template #default="{ row }">
            <code v-if="row.detail" class="detail">{{ JSON.stringify(row.detail).slice(0, 160) }}</code>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="ip" label="IP" width="130" />
      </ElTable>
      <ElPagination v-model:current-page="crud.query.page" class="mt" layout="prev, pager, next, total" :total="crud.meta.value.total" :page-size="crud.query.limit" />
    </ElCard>
  </div>
</template>

<style scoped>
.detail { font-size: 11px; }
.mt { margin-top: 12px; }
</style>
