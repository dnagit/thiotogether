<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useCrud } from '@/composables/useCrud';
import MediaPicker from '@/components/MediaPicker.vue';
import { PERMISSIONS } from '@cms/shared';

const crud = useCrud<any>({ endpoint: '/bank-accounts' });

const dialog = ref(false);
const blank = { id: null as number | null, bankName: '', accountName: '', accountNumber: '', branch: '', qrCodeUrl: null, isActive: true };
const form = reactive({ ...blank });

function openDialog(row?: any): void {
  Object.assign(form, blank, row ?? {});
  dialog.value = true;
}

async function save(): Promise<void> {
  const payload: any = { ...form };
  delete payload.id;
  delete payload.createdAt;
  delete payload.updatedAt;
  delete payload.deletedAt;
  delete payload.projects;
  if (form.id) await crud.updateItem(form.id, payload);
  else await crud.createItem(payload);
  dialog.value = false;
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>Bank Accounts</h1>
      <ElButton v-permission="PERMISSIONS.BANK_ACCOUNTS_MANAGE" type="primary" @click="openDialog()">+ New Account</ElButton>
    </div>

    <ElCard>
      <div class="toolbar">
        <ElInput v-model="crud.query.search" placeholder="Search…" clearable style="width: 240px" />
      </div>
      <ElTable v-loading="crud.loading.value" :data="crud.items.value">
        <ElTableColumn prop="bankName" label="Bank" width="140" />
        <ElTableColumn prop="accountName" label="Account Name" min-width="180" />
        <ElTableColumn prop="accountNumber" label="Account Number" width="170" />
        <ElTableColumn prop="branch" label="Branch" width="140" />
        <ElTableColumn label="QR" width="80" align="center">
          <template #default="{ row }">
            <ElImage v-if="row.qrCodeUrl" :src="row.qrCodeUrl" style="width: 36px; height: 36px" :preview-src-list="[row.qrCodeUrl]" />
            <span v-else class="text-muted">—</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="Active" width="90" align="center">
          <template #default="{ row }"><ElTag size="small" :type="row.isActive ? 'success' : 'info'">{{ row.isActive ? 'Yes' : 'No' }}</ElTag></template>
        </ElTableColumn>
        <ElTableColumn label="Actions" width="170" fixed="right">
          <template #default="{ row }">
            <ElButton size="small" @click="openDialog(row)">Edit</ElButton>
            <ElButton v-permission="PERMISSIONS.BANK_ACCOUNTS_MANAGE" size="small" type="danger" text @click="crud.deleteItem(row.id, row.accountNumber)">Delete</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
      <ElPagination v-model:current-page="crud.query.page" class="mt" layout="prev, pager, next, total" :total="crud.meta.value.total" :page-size="crud.query.limit" />
    </ElCard>

    <ElDialog v-model="dialog" :title="form.id ? 'Edit Account' : 'New Account'" width="480px">
      <ElForm label-position="top">
        <ElFormItem label="Bank Name" required><ElInput v-model="form.bankName" placeholder="SCB / KBank / …" /></ElFormItem>
        <ElFormItem label="Account Name" required><ElInput v-model="form.accountName" /></ElFormItem>
        <ElFormItem label="Account Number" required><ElInput v-model="form.accountNumber" /></ElFormItem>
        <ElFormItem label="Branch"><ElInput v-model="form.branch" /></ElFormItem>
        <ElFormItem label="QR Code Image"><MediaPicker v-model="form.qrCodeUrl" /></ElFormItem>
        <ElFormItem><ElCheckbox v-model="form.isActive">Active</ElCheckbox></ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialog = false">Cancel</ElButton>
        <ElButton type="primary" :loading="crud.saving.value" :disabled="!form.bankName || !form.accountName || !form.accountNumber" @click="save">Save</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.mt { margin-top: 12px; }
</style>
