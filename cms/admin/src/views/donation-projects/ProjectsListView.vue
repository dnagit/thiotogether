<script setup lang="ts">
import { reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { http } from '@/api/http';
import { useCrud } from '@/composables/useCrud';
import MediaPicker from '@/components/MediaPicker.vue';
import { formatCurrency, progressPercent, slugify, PERMISSIONS, type ApiResponse } from '@cms/shared';

const crud = useCrud<any>({ endpoint: '/donation-projects' });
const bankAccounts = ref<any[]>([]);

async function loadBanks(): Promise<void> {
  const { data } = await http.get<ApiResponse<any[]>>('/bank-accounts', { params: { limit: 100 } });
  bankAccounts.value = data.data;
}
void loadBanks();

const dialog = ref(false);
const blank = {
  id: null as number | null, name: '', slug: '', description: '', shortDescription: '',
  coverImage: null, bannerImage: null, targetAmount: 100000, currency: 'THB',
  themeColor: '#2563eb', startDate: null, endDate: null, isActive: true, sortOrder: 0,
  metaTitle: '', metaDescription: '', bankAccountIds: [] as number[],
};
const form = reactive({ ...blank });

function openDialog(row?: any): void {
  Object.assign(form, blank, row ?? {}, {
    targetAmount: row ? Number(row.targetAmount) : blank.targetAmount,
    bankAccountIds: row ? (row.bankAccounts ?? []).map((pb: any) => pb.bankAccount?.id ?? pb.bankAccountId) : [],
  });
  dialog.value = true;
}

async function save(): Promise<void> {
  const payload: any = { ...form, slug: form.slug || slugify(form.name) };
  delete payload.id;
  delete (payload as any).bankAccounts;
  delete (payload as any).currentAmount;
  delete (payload as any).stats;
  delete (payload as any).createdAt;
  delete (payload as any).updatedAt;
  delete (payload as any).deletedAt;
  if (form.id) await crud.updateItem(form.id, payload);
  else await crud.createItem(payload);
  dialog.value = false;
}

async function action(id: number, verb: 'duplicate' | 'archive' | 'activate'): Promise<void> {
  await http.post(`/donation-projects/${id}/${verb}`);
  ElMessage.success(verb === 'duplicate' ? 'Duplicated (inactive draft)' : verb === 'archive' ? 'Archived' : 'Activated');
  await crud.fetchList();
}

async function move(index: number, dir: -1 | 1): Promise<void> {
  const ids = crud.items.value.map((p: any) => p.id);
  const target = index + dir;
  if (target < 0 || target >= ids.length) return;
  [ids[index], ids[target]] = [ids[target], ids[index]];
  await http.post('/donation-projects/reorder', { orderedIds: ids });
  await crud.fetchList();
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>Donation Projects</h1>
      <ElButton v-permission="PERMISSIONS.DONATION_PROJECTS_MANAGE" type="primary" @click="openDialog()">+ New Project</ElButton>
    </div>

    <ElCard>
      <div class="toolbar">
        <ElInput v-model="crud.query.search" placeholder="Search…" clearable style="width: 240px" />
        <ElSelect v-model="crud.query.filters.isActive" placeholder="Status" clearable style="width: 140px">
          <ElOption :value="'true'" label="Active" />
          <ElOption :value="'false'" label="Archived" />
        </ElSelect>
      </div>

      <ElTable v-loading="crud.loading.value" :data="crud.items.value">
        <ElTableColumn label="" width="70">
          <template #default="{ $index }">
            <ElButtonGroup>
              <ElButton size="small" text @click="move($index, -1)">↑</ElButton>
              <ElButton size="small" text @click="move($index, 1)">↓</ElButton>
            </ElButtonGroup>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="name" label="Project" min-width="200">
          <template #default="{ row }">
            <b>{{ row.name }}</b>
            <div class="text-muted">/donation/{{ row.slug }}</div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="Progress" min-width="200">
          <template #default="{ row }">
            <ElProgress :percentage="progressPercent(Number(row.currentAmount), Number(row.targetAmount))" :color="row.themeColor ?? undefined" />
            <span class="text-muted">
              {{ formatCurrency(Number(row.currentAmount), row.currency) }} / {{ formatCurrency(Number(row.targetAmount), row.currency) }}
            </span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="Status" width="100" align="center">
          <template #default="{ row }">
            <ElTag size="small" :type="row.isActive ? 'success' : 'info'">{{ row.isActive ? 'Active' : 'Archived' }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="Actions" width="330" fixed="right">
          <template #default="{ row }">
            <ElButton size="small" @click="openDialog(row)">Edit</ElButton>
            <ElButton size="small" plain @click="action(row.id, 'duplicate')">Copy</ElButton>
            <ElButton v-if="row.isActive" size="small" plain @click="action(row.id, 'archive')">Archive</ElButton>
            <ElButton v-else size="small" plain type="success" @click="action(row.id, 'activate')">Activate</ElButton>
            <ElButton size="small" type="danger" text @click="crud.deleteItem(row.id, row.name)">Delete</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>

      <ElPagination
        v-model:current-page="crud.query.page"
        class="mt"
        layout="prev, pager, next, total"
        :total="crud.meta.value.total"
        :page-size="crud.query.limit"
      />
    </ElCard>

    <ElDialog v-model="dialog" :title="form.id ? 'Edit Project' : 'New Project'" width="720px" top="4vh">
      <ElForm label-position="top">
        <ElRow :gutter="12">
          <ElCol :span="12"><ElFormItem label="Project Name" required><ElInput v-model="form.name" /></ElFormItem></ElCol>
          <ElCol :span="12"><ElFormItem label="Slug"><ElInput v-model="form.slug" :placeholder="slugify(form.name)" /></ElFormItem></ElCol>
        </ElRow>
        <ElFormItem label="Short Description"><ElInput v-model="form.shortDescription" maxlength="500" /></ElFormItem>
        <ElFormItem label="Description (HTML)"><ElInput v-model="form.description" type="textarea" :rows="5" /></ElFormItem>
        <ElRow :gutter="12">
          <ElCol :span="8"><ElFormItem label="Target Amount" required><ElInputNumber v-model="form.targetAmount" :min="1" :step="1000" style="width: 100%" /></ElFormItem></ElCol>
          <ElCol :span="8">
            <ElFormItem label="Currency">
              <ElSelect v-model="form.currency" style="width: 100%">
                <ElOption value="THB" /><ElOption value="USD" /><ElOption value="EUR" />
              </ElSelect>
            </ElFormItem>
          </ElCol>
          <ElCol :span="8"><ElFormItem label="Theme Color"><ElColorPicker v-model="form.themeColor" /></ElFormItem></ElCol>
        </ElRow>
        <ElRow :gutter="12">
          <ElCol :span="12"><ElFormItem label="Start Date"><ElDatePicker v-model="form.startDate" type="date" style="width: 100%" /></ElFormItem></ElCol>
          <ElCol :span="12"><ElFormItem label="End Date"><ElDatePicker v-model="form.endDate" type="date" style="width: 100%" /></ElFormItem></ElCol>
        </ElRow>
        <ElRow :gutter="12">
          <ElCol :span="12"><ElFormItem label="Cover Image"><MediaPicker v-model="form.coverImage" /></ElFormItem></ElCol>
          <ElCol :span="12"><ElFormItem label="Banner"><MediaPicker v-model="form.bannerImage" /></ElFormItem></ElCol>
        </ElRow>
        <ElFormItem label="Receiving Bank Accounts">
          <ElSelect v-model="form.bankAccountIds" multiple style="width: 100%">
            <ElOption
              v-for="b in bankAccounts"
              :key="b.id"
              :value="b.id"
              :label="`${b.bankName} — ${b.accountNumber} (${b.accountName})`"
            />
          </ElSelect>
        </ElFormItem>
        <ElRow :gutter="12">
          <ElCol :span="12"><ElFormItem label="SEO Meta Title"><ElInput v-model="form.metaTitle" /></ElFormItem></ElCol>
          <ElCol :span="12"><ElFormItem label="SEO Meta Description"><ElInput v-model="form.metaDescription" /></ElFormItem></ElCol>
        </ElRow>
        <ElFormItem><ElCheckbox v-model="form.isActive">Active (visible on website)</ElCheckbox></ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialog = false">Cancel</ElButton>
        <ElButton type="primary" :loading="crud.saving.value" :disabled="!form.name || !form.description" @click="save">Save</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.mt { margin-top: 12px; }
</style>
