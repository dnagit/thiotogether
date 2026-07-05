<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { http } from '@/api/http';

const email = ref('');
const loading = ref(false);
const sent = ref(false);

async function submit(): Promise<void> {
  loading.value = true;
  try {
    await http.post('/auth/forgot-password', { email: email.value });
    sent.value = true;
    ElMessage.success('If the email exists, a reset link has been sent');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <ElCard class="auth-card">
      <h1>Forgot Password</h1>
      <template v-if="!sent">
        <p class="text-muted">Enter your email and we'll send you a reset link.</p>
        <ElInput v-model="email" type="email" placeholder="you@example.com" class="mb" @keyup.enter="submit" />
        <ElButton type="primary" class="w-full" :loading="loading" :disabled="!email" @click="submit">
          Send Reset Link
        </ElButton>
      </template>
      <ElResult v-else icon="success" title="Check your inbox" sub-title="A reset link is on its way if the address is registered." />
      <div class="links"><RouterLink :to="{ name: 'login' }">← Back to login</RouterLink></div>
    </ElCard>
  </div>
</template>

<style scoped>
.auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--el-bg-color-page); }
.auth-card { width: 380px; text-align: center; padding: 8px; }
.mb { margin-bottom: 12px; }
.w-full { width: 100%; }
.links { margin-top: 16px; font-size: 13px; }
</style>
