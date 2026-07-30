<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { confirmDelete } from '@/utils/confirm';
import { http } from '@/api/http';
import { PERMISSIONS, type ApiResponse } from '@cms/shared';

const roles = ref<any[]>([]);
const permissions = ref<any[]>([]);
const loading = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [r, p] = await Promise.all([
      http.get<ApiResponse<any[]>>('/roles'),
      http.get<ApiResponse<any[]>>('/roles/permissions'),
    ]);
    roles.value = r.data.data;
    permissions.value = p.data.data;
  } finally {
    loading.value = false;
  }
}
void load();

/** Group permission names by resource prefix for a tidy checkbox grid. */
const grouped = computed(() => {
  const groups = new Map<string, string[]>();
  for (const p of permissions.value) {
    const resource = p.name.split('.')[0];
    groups.set(resource, [...(groups.get(resource) ?? []), p.name]);
  }
  return [...groups.entries()].map(([resource, perms]) => ({ resource, perms }));
});

const dialog = ref(false);
const form = reactive({
  id: null as number | null, name: '', displayName: '', description: '', isSystem: false,
  permissions: [] as string[],
});

function openDialog(role?: any): void {
  Object.assign(form, role
    ? { ...role, permissions: [...(role.permissions ?? [])] }
    : { id: null, name: '', displayName: '', description: '', isSystem: false, permissions: [] });
  dialog.value = true;
}

async function save(): Promise<void> {
  const payload = {
    name: form.name, displayName: form.displayName,
    description: form.description || null, permissions: form.permissions,
  };
  if (form.id) await http.put(`/roles/${form.id}`, payload);
  else await http.post('/roles', payload);
  dialog.value = false;
  ElMessage.success('Role saved');
  await load();
}

async function remove(role: any): Promise<void> {
  try {
    if (!(await confirmDelete(role.displayName, { note: `ต้องการลบบทบาท "${role.displayName}" ใช่หรือไม่?` }))) return;
  } catch {
    return;
  }
  await http.delete(`/roles/${role.id}`);
  await load();
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>Roles & Permissions</h1>
      <ElButton v-permission="PERMISSIONS.ROLES_MANAGE" type="primary" @click="openDialog()">+ New Role</ElButton>
    </div>

    <ElCard>
      <ElTable v-loading="loading" :data="roles">
        <ElTableColumn prop="displayName" label="Role" width="180">
          <template #default="{ row }">
            <b>{{ row.displayName }}</b>
            <ElTag v-if="row.isSystem" size="small" class="ml">system</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="description" label="Description" min-width="180" />
        <ElTableColumn label="Permissions" min-width="300">
          <template #default="{ row }">
            <span class="text-muted">{{ row.permissions.length }} permission(s)</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="Actions" width="170" fixed="right">
          <template #default="{ row }">
            <ElButton v-permission="PERMISSIONS.ROLES_MANAGE" size="small" @click="openDialog(row)">Edit</ElButton>
            <ElButton v-if="!row.isSystem" v-permission="PERMISSIONS.ROLES_MANAGE" size="small" type="danger" text @click="remove(row)">Delete</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>

    <ElDialog v-model="dialog" :title="form.id ? `Edit Role: ${form.displayName}` : 'New Role'" width="640px" top="5vh">
      <ElForm label-position="top">
        <ElRow :gutter="12">
          <ElCol :span="12">
            <ElFormItem label="Key (UPPER_SNAKE)" required>
              <ElInput v-model="form.name" :disabled="form.isSystem" placeholder="CONTENT_MANAGER" />
            </ElFormItem>
          </ElCol>
          <ElCol :span="12">
            <ElFormItem label="Display Name" required><ElInput v-model="form.displayName" /></ElFormItem>
          </ElCol>
        </ElRow>
        <ElFormItem label="Description"><ElInput v-model="form.description" /></ElFormItem>

        <ElDivider>Permissions</ElDivider>
        <ElCheckboxGroup v-model="form.permissions">
          <div v-for="group in grouped" :key="group.resource" class="perm-group">
            <b class="perm-title">{{ group.resource }}</b>
            <ElCheckbox v-for="perm in group.perms" :key="perm" :value="perm">{{ perm.split('.')[1] }}</ElCheckbox>
          </div>
        </ElCheckboxGroup>
      </ElForm>
      <template #footer>
        <ElButton @click="dialog = false">Cancel</ElButton>
        <ElButton type="primary" :disabled="!form.name || !form.displayName" @click="save">Save</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.ml { margin-left: 6px; }
.perm-group { margin-bottom: 8px; padding: 8px 10px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; }
.perm-title { display: inline-block; width: 160px; text-transform: capitalize; }
</style>
