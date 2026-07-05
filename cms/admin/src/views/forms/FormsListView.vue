<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { http } from '@/api/http';
import { PERMISSIONS, slugify, type ApiResponse } from '@cms/shared';

const router = useRouter();
const forms = ref<any[]>([]);
const loading = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const { data } = await http.get<ApiResponse<any[]>>('/forms');
    forms.value = data.data;
  } finally {
    loading.value = false;
  }
}
void load();

const dialog = ref(false);
const form = reactive({
  id: null as number | null, name: '', slug: '', description: '',
  submitLabel: 'Submit', successMessage: 'Thank you!', notifyEmail: '', isActive: true,
});

function openDialog(existing?: any): void {
  Object.assign(form, existing ?? {
    id: null, name: '', slug: '', description: '',
    submitLabel: 'Submit', successMessage: 'Thank you!', notifyEmail: '', isActive: true,
  });
  dialog.value = true;
}

async function save(): Promise<void> {
  const payload = {
    name: form.name,
    slug: form.slug || slugify(form.name),
    description: form.description || null,
    submitLabel: form.submitLabel,
    successMessage: form.successMessage,
    notifyEmail: form.notifyEmail || null,
    isActive: form.isActive,
  };
  if (form.id) await http.put(`/forms/${form.id}`, payload);
  else {
    const { data } = await http.post<ApiResponse<any>>('/forms', payload);
    dialog.value = false;
    void router.push({ name: 'form-builder', params: { id: data.data.id } });
    return;
  }
  dialog.value = false;
  ElMessage.success('Saved');
  await load();
}

async function remove(row: any): Promise<void> {
  try {
    await ElMessageBox.confirm(`Delete form "${row.name}"?`, 'Confirm', { type: 'warning' });
  } catch {
    return;
  }
  await http.delete(`/forms/${row.id}`);
  await load();
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>Forms</h1>
      <ElButton v-permission="PERMISSIONS.FORMS_MANAGE" type="primary" @click="openDialog()">+ New Form</ElButton>
    </div>

    <ElCard>
      <ElTable v-loading="loading" :data="forms">
        <ElTableColumn prop="name" label="Name" min-width="180" />
        <ElTableColumn prop="slug" label="Slug" width="160">
          <template #default="{ row }"><code>{{ row.slug }}</code></template>
        </ElTableColumn>
        <ElTableColumn label="Fields" width="90" align="center">
          <template #default="{ row }">{{ row._count?.fields ?? 0 }}</template>
        </ElTableColumn>
        <ElTableColumn label="Submissions" width="120" align="center">
          <template #default="{ row }">{{ row._count?.submissions ?? 0 }}</template>
        </ElTableColumn>
        <ElTableColumn label="Active" width="90" align="center">
          <template #default="{ row }"><ElTag size="small" :type="row.isActive ? 'success' : 'info'">{{ row.isActive ? 'Yes' : 'No' }}</ElTag></template>
        </ElTableColumn>
        <ElTableColumn label="Actions" width="300" fixed="right">
          <template #default="{ row }">
            <ElButton size="small" @click="openDialog(row)">Edit</ElButton>
            <ElButton v-permission="PERMISSIONS.FORMS_MANAGE" size="small" type="primary" plain @click="router.push({ name: 'form-builder', params: { id: row.id } })">Builder</ElButton>
            <ElButton size="small" plain @click="router.push({ name: 'form-submissions', params: { id: row.id } })">Submissions</ElButton>
            <ElButton v-permission="PERMISSIONS.FORMS_MANAGE" size="small" type="danger" text @click="remove(row)">Delete</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>

    <ElDialog v-model="dialog" :title="form.id ? 'Edit Form' : 'New Form'" width="480px">
      <ElForm label-position="top">
        <ElFormItem label="Name" required><ElInput v-model="form.name" /></ElFormItem>
        <ElFormItem label="Slug"><ElInput v-model="form.slug" :placeholder="slugify(form.name)" /></ElFormItem>
        <ElFormItem label="Description"><ElInput v-model="form.description" type="textarea" :rows="2" /></ElFormItem>
        <ElFormItem label="Submit Button Label"><ElInput v-model="form.submitLabel" /></ElFormItem>
        <ElFormItem label="Success Message"><ElInput v-model="form.successMessage" /></ElFormItem>
        <ElFormItem label="Notify Email"><ElInput v-model="form.notifyEmail" type="email" /></ElFormItem>
        <ElFormItem><ElCheckbox v-model="form.isActive">Active</ElCheckbox></ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialog = false">Cancel</ElButton>
        <ElButton type="primary" :disabled="!form.name" @click="save">Save</ElButton>
      </template>
    </ElDialog>
  </div>
</template>
