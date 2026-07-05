<script setup lang="ts">
import { reactive, ref } from 'vue';
import { http } from '@/api/http';
import { useCrud } from '@/composables/useCrud';
import { formatDateTime, PERMISSIONS, type ApiResponse } from '@cms/shared';

const crud = useCrud<any>({ endpoint: '/users' });
const roles = ref<any[]>([]);
void http.get<ApiResponse<any[]>>('/users/roles/options').then(({ data }) => (roles.value = data.data));

const dialog = ref(false);
const blank = { id: null as number | null, name: '', email: '', password: '', roleId: null as number | null, isActive: true };
const form = reactive({ ...blank });

function openDialog(row?: any): void {
  Object.assign(form, blank, row ? { ...row, password: '' } : {});
  dialog.value = true;
}

async function save(): Promise<void> {
  const payload: any = {
    name: form.name, email: form.email, roleId: form.roleId, isActive: form.isActive,
  };
  if (form.password) payload.password = form.password;
  if (form.id) await crud.updateItem(form.id, payload);
  else await crud.createItem({ ...payload, password: form.password });
  dialog.value = false;
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>Users</h1>
      <div>
        <RouterLink :to="{ name: 'roles' }"><ElButton v-permission="PERMISSIONS.ROLES_VIEW" plain>Roles & Permissions</ElButton></RouterLink>
        <ElButton v-permission="PERMISSIONS.USERS_CREATE" type="primary" @click="openDialog()">+ New User</ElButton>
      </div>
    </div>

    <ElCard>
      <div class="toolbar">
        <ElInput v-model="crud.query.search" placeholder="Search name / email…" clearable style="width: 240px" />
        <ElSelect v-model="crud.query.filters.roleId" placeholder="Role" clearable style="width: 180px">
          <ElOption v-for="r in roles" :key="r.id" :value="String(r.id)" :label="r.displayName" />
        </ElSelect>
      </div>

      <ElTable v-loading="crud.loading.value" :data="crud.items.value">
        <ElTableColumn prop="name" label="Name" min-width="160" />
        <ElTableColumn prop="email" label="Email" min-width="200" />
        <ElTableColumn label="Role" width="140">
          <template #default="{ row }"><ElTag size="small">{{ row.role?.displayName }}</ElTag></template>
        </ElTableColumn>
        <ElTableColumn label="Active" width="90" align="center">
          <template #default="{ row }"><ElTag size="small" :type="row.isActive ? 'success' : 'danger'">{{ row.isActive ? 'Yes' : 'No' }}</ElTag></template>
        </ElTableColumn>
        <ElTableColumn label="Last Login" width="170">
          <template #default="{ row }">{{ row.lastLoginAt ? formatDateTime(row.lastLoginAt) : '—' }}</template>
        </ElTableColumn>
        <ElTableColumn label="Actions" width="170" fixed="right">
          <template #default="{ row }">
            <ElButton v-permission="PERMISSIONS.USERS_UPDATE" size="small" @click="openDialog(row)">Edit</ElButton>
            <ElButton v-permission="PERMISSIONS.USERS_DELETE" size="small" type="danger" text @click="crud.deleteItem(row.id, row.email)">Delete</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
      <ElPagination v-model:current-page="crud.query.page" class="mt" layout="prev, pager, next, total" :total="crud.meta.value.total" :page-size="crud.query.limit" />
    </ElCard>

    <ElDialog v-model="dialog" :title="form.id ? 'Edit User' : 'New User'" width="440px">
      <ElForm label-position="top">
        <ElFormItem label="Name" required><ElInput v-model="form.name" /></ElFormItem>
        <ElFormItem label="Email" required><ElInput v-model="form.email" type="email" /></ElFormItem>
        <ElFormItem :label="form.id ? 'New Password (leave blank to keep)' : 'Password'" :required="!form.id">
          <ElInput v-model="form.password" type="password" show-password autocomplete="new-password" />
        </ElFormItem>
        <ElFormItem label="Role" required>
          <ElSelect v-model="form.roleId" style="width: 100%">
            <ElOption v-for="r in roles" :key="r.id" :value="r.id" :label="r.displayName" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem><ElCheckbox v-model="form.isActive">Active</ElCheckbox></ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialog = false">Cancel</ElButton>
        <ElButton type="primary" :loading="crud.saving.value" :disabled="!form.name || !form.email || !form.roleId || (!form.id && form.password.length < 8)" @click="save">Save</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.mt { margin-top: 12px; }
</style>
