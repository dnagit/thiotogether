<script setup lang="ts">
import { tagMapper } from '@/utils/elementTypes';
import { computed, ref } from 'vue';
import { useIsMobile } from '@/composables/useIsMobile';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { confirmDelete } from '@/utils/confirm';
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
    if (!(await confirmDelete(row.title, { note: `ต้องการลบหน้า "${row.title}" ใช่หรือไม่?` }))) return;
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

/** Phones get the tree as a flat list of cards, each indented by how deep it sits. */
const isMobile = useIsMobile();
const flat = computed(() => {
  const out: Array<{ node: PageTreeNode; depth: number }> = [];
  const walk = (nodes: PageTreeNode[], depth: number) => {
    for (const n of nodes) {
      out.push({ node: n, depth });
      walk(n.children ?? [], depth + 1);
    }
  };
  walk(tree.value, 0);
  return out;
});

const statusTag = tagMapper({ PUBLISHED: 'success', DRAFT: 'info', ARCHIVED: 'warning' });
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
      <div v-if="isMobile" v-loading="loading" class="m-list">
        <div
          v-for="{ node, depth } in flat"
          :key="node.id"
          class="m-card"
          :style="{ paddingLeft: `${4 + depth * 16}px` }"
        >
          <div class="m-card-body">
            <div class="m-card-top">
              <span class="m-card-title"
                ><span v-if="depth" class="text-muted">↳ </span>{{ node.title }}</span
              >
              <ElTag size="small" :type="statusTag(node.status)">{{ node.status }}</ElTag>
            </div>
            <code class="m-card-meta">{{ node.path }}</code>
            <div class="m-card-actions">
              <ElButton
                v-permission="PERMISSIONS.PAGES_UPDATE"
                size="small"
                @click="router.push({ name: 'page-edit', params: { id: node.id } })"
                >Edit</ElButton
              >
              <ElButton
                v-permission="PERMISSIONS.PAGES_UPDATE"
                size="small"
                type="primary"
                plain
                @click="router.push({ name: 'page-builder', params: { id: node.id } })"
                >Builder</ElButton
              >
              <ElButton v-permission="PERMISSIONS.PAGES_CREATE" size="small" plain @click="duplicate(node)"
                >Copy</ElButton
              >
              <ElButton
                v-permission="PERMISSIONS.PAGES_DELETE"
                size="small"
                type="danger"
                text
                @click="remove(node)"
                >Delete</ElButton
              >
            </div>
          </div>
        </div>
        <div v-if="!loading && !flat.length" class="m-empty">No pages yet</div>
      </div>
      <ElTable v-else v-loading="loading" :data="tree" row-key="id" default-expand-all>
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
            <!-- Element Plus types slot rows as DefaultRow; the table is fed PageTreeNode. -->
            <ElButton v-permission="PERMISSIONS.PAGES_CREATE" size="small" plain @click="duplicate(row as PageTreeNode)">Copy</ElButton>
            <ElButton v-permission="PERMISSIONS.PAGES_DELETE" size="small" type="danger" text @click="remove(row as PageTreeNode)">Delete</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>
  </div>
</template>
