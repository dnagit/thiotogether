<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { http } from '@/api/http';
import { PERMISSIONS, type ApiResponse, type PageTreeNode } from '@cms/shared';

const router = useRouter();
const tree = ref<PageTreeNode[]>([]);
const loading = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const { data } = await http.get<ApiResponse<PageTreeNode[]>>('/pages/tree');
    tree.value = data.data;
  } finally {
    loading.value = false;
  }
}
void load();

async function remove(row: PageTreeNode): Promise<void> {
  try {
    await ElMessageBox.confirm(`Delete page "${row.title}"?`, 'Confirm', { type: 'warning' });
  } catch {
    return;
  }
  await http.delete(`/pages/${row.id}`);
  ElMessage.success('Deleted');
  await load();
}

async function duplicate(row: PageTreeNode): Promise<void> {
  await http.post(`/pages/${row.id}/duplicate`);
  ElMessage.success('Duplicated as draft');
  await load();
}

const statusTag = (s: string) => ({ PUBLISHED: 'success', DRAFT: 'info', ARCHIVED: 'warning' })[s] ?? 'info';
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>Pages</h1>
      <ElButton v-permission="PERMISSIONS.PAGES_CREATE" type="primary" @click="router.push({ name: 'page-new' })">
        + New Page
      </ElButton>
    </div>

    <ElCard>
      <ElTable v-loading="loading" :data="tree" row-key="id" default-expand-all>
        <ElTableColumn prop="title" label="Title" min-width="220" />
        <ElTableColumn prop="path" label="URL" min-width="220">
          <template #default="{ row }"><code>{{ row.path }}</code></template>
        </ElTableColumn>
        <ElTableColumn label="Status" width="120">
          <template #default="{ row }"><ElTag size="small" :type="statusTag(row.status)">{{ row.status }}</ElTag></template>
        </ElTableColumn>
        <ElTableColumn label="Actions" width="280" fixed="right">
          <template #default="{ row }">
            <ElButton v-permission="PERMISSIONS.PAGES_UPDATE" size="small" @click="router.push({ name: 'page-edit', params: { id: row.id } })">Edit</ElButton>
            <ElButton v-permission="PERMISSIONS.PAGES_UPDATE" size="small" type="primary" plain @click="router.push({ name: 'page-builder', params: { id: row.id } })">Builder</ElButton>
            <ElButton v-permission="PERMISSIONS.PAGES_CREATE" size="small" plain @click="duplicate(row)">Copy</ElButton>
            <ElButton v-permission="PERMISSIONS.PAGES_DELETE" size="small" type="danger" text @click="remove(row)">Delete</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>
  </div>
</template>
