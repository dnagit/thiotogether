<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { http } from '@/api/http';

const route = useRoute();
const router = useRouter();
const password = ref('');
const confirm = ref('');
const loading = ref(false);

async function submit(): Promise<void> {
  if (password.value !== confirm.value) {
    ElMessage.warning('Passwords do not match');
    return;
  }
  loading.value = true;
  try {
    await http.post('/auth/reset-password', { token: route.query.token, password: password.value });
    ElMessage.success('Password reset — please sign in');
    void router.push({ name: 'login' });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <ElCard class="auth-card">
      <h1>Reset Password</h1>
      <ElInput v-model="password" type="password" show-password placeholder="New password (min 8 chars)" class="mb" />
      <ElInput v-model="confirm" type="password" show-password placeholder="Confirm password" class="mb" />
      <ElButton type="primary" class="w-full" :loading="loading" :disabled="password.length < 8" @click="submit">
        Reset Password
      </ElButton>
    </ElCard>
  </div>
</template>

<style scoped>
.auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--el-bg-color-page); }
.auth-card { width: 380px; text-align: center; padding: 8px; }
.mb { margin-bottom: 12px; }
.w-full { width: 100%; }
</style>
