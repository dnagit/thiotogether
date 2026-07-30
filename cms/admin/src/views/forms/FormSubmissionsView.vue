<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { confirmDelete } from '@/utils/confirm';
import { http } from '@/api/http';
import { formatDateTime, PERMISSIONS, type ApiResponse, type PaginationMeta } from '@cms/shared';

const route = useRoute();
const router = useRouter();
const formId = Number(route.params.id);

const formMeta = ref<any | null>(null);
const rows = ref<any[]>([]);
const loading = ref(false);
const page = ref(1);
const meta = ref<PaginationMeta>({ page: 1, limit: 20, total: 0, totalPages: 1 });

const columns = computed<string[]>(() => (formMeta.value?.fields ?? []).map((f: any) => f.name));
const labels = computed<Record<string, string>>(() =>
  Object.fromEntries((formMeta.value?.fields ?? []).map((f: any) => [f.name, f.label])),
);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [{ data: form }, { data: subs }] = await Promise.all([
      http.get<ApiResponse<any>>(`/forms/${formId}`),
      http.get<ApiResponse<any[]>>(`/forms/${formId}/submissions`, { params: { page: page.value, limit: 20 } }),
    ]);
    formMeta.value = form.data;
    rows.value = subs.data;
    if (subs.meta) meta.value = subs.meta;
  } finally {
    loading.value = false;
  }
}
void load();
watch(page, load);

async function remove(row: any): Promise<void> {
  try {
    if (!(await confirmDelete('รายการนี้', { note: 'ต้องการลบรายการที่ส่งเข้ามานี้ ใช่หรือไม่?' }))) return;
  } catch {
    return;
  }
  await http.delete(`/forms/submissions/${row.id}`);
  ElMessage.success('Deleted');
  await load();
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>
        <ElButton text @click="router.push({ name: 'forms' })">←</ElButton>
        Submissions — {{ formMeta?.name }}
      </h1>
    </div>

    <ElCard>
      <ElTable v-loading="loading" :data="rows" stripe>
        <ElTableColumn label="Date" width="160">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </ElTableColumn>
        <ElTableColumn v-for="col in columns" :key="col" :label="labels[col] ?? col" min-width="140">
          <template #default="{ row }">{{ Array.isArray(row.data[col]) ? row.data[col].join(', ') : row.data[col] }}</template>
        </ElTableColumn>
        <ElTableColumn label="IP" width="130" prop="ip" />
        <ElTableColumn label="" width="70" fixed="right">
          <template #default="{ row }">
            <ElButton v-permission="PERMISSIONS.FORM_SUBMISSIONS_DELETE" size="small" text type="danger" @click="remove(row)">✕</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
      <ElPagination
        v-model:current-page="page"
        class="mt"
        layout="prev, pager, next, total"
        :total="meta.total"
        :page-size="meta.limit"
      />
    </ElCard>
  </div>
</template>

<style scoped>
.mt { margin-top: 12px; }
</style>
