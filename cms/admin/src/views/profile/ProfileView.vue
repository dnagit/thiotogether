<script setup lang="ts">
import { reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { http } from '@/api/http';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const form = reactive({ currentPassword: '', newPassword: '', confirm: '' });
const loading = ref(false);

async function changePassword(): Promise<void> {
  if (form.newPassword !== form.confirm) {
    ElMessage.warning('Passwords do not match');
    return;
  }
  loading.value = true;
  try {
    await http.post('/auth/change-password', {
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    });
    ElMessage.success('Password changed — please sign in again');
    await auth.logout();
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="page-container">
    <div class="page-header"><h1>My Profile</h1></div>
    <ElRow :gutter="16">
      <ElCol :xs="24" :md="10">
        <ElCard header="Account">
          <ElDescriptions :column="1" border>
            <ElDescriptionsItem label="Name">{{ auth.user?.name }}</ElDescriptionsItem>
            <ElDescriptionsItem label="Email">{{ auth.user?.email }}</ElDescriptionsItem>
            <ElDescriptionsItem label="Role"><ElTag>{{ auth.user?.role }}</ElTag></ElDescriptionsItem>
          </ElDescriptions>
        </ElCard>
      </ElCol>
      <ElCol :xs="24" :md="10">
        <ElCard header="Change Password">
          <ElForm label-position="top">
            <ElFormItem label="Current Password"><ElInput v-model="form.currentPassword" type="password" show-password /></ElFormItem>
            <ElFormItem label="New Password (min 8 chars)"><ElInput v-model="form.newPassword" type="password" show-password /></ElFormItem>
            <ElFormItem label="Confirm New Password"><ElInput v-model="form.confirm" type="password" show-password /></ElFormItem>
            <ElButton type="primary" :loading="loading" :disabled="form.newPassword.length < 8" @click="changePassword">Change Password</ElButton>
          </ElForm>
        </ElCard>
      </ElCol>
    </ElRow>
  </div>
</template>
