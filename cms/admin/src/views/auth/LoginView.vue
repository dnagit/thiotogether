<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

const formRef = ref<FormInstance>();
const loading = ref(false);
const form = reactive({ email: '', password: '' });

const rules: FormRules = {
  email: [{ required: true, type: 'email', message: 'Valid email required', trigger: 'blur' }],
  password: [{ required: true, min: 8, message: 'Minimum 8 characters', trigger: 'blur' }],
};

async function submit(): Promise<void> {
  if (!(await formRef.value?.validate().catch(() => false))) return;
  loading.value = true;
  try {
    await auth.login(form.email, form.password);
    ElMessage.success(`Welcome back, ${auth.user?.name}`);
    void router.push((route.query.redirect as string) || { name: 'dashboard' });
  } catch {
    // interceptor shows the message
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <ElCard class="auth-card">
      <h1>⚡ CMS Admin</h1>
      <p class="text-muted">Sign in to manage your website</p>
      <ElForm ref="formRef" :model="form" :rules="rules" label-position="top" @keyup.enter="submit">
        <ElFormItem label="Email" prop="email">
          <ElInput v-model="form.email" type="email" autocomplete="username" />
        </ElFormItem>
        <ElFormItem label="Password" prop="password">
          <ElInput v-model="form.password" type="password" show-password autocomplete="current-password" />
        </ElFormItem>
        <ElButton type="primary" class="w-full" :loading="loading" @click="submit">Sign In</ElButton>
      </ElForm>
      <div class="links">
        <RouterLink :to="{ name: 'forgot-password' }">Forgot password?</RouterLink>
      </div>
    </ElCard>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-bg-color-page);
}
.auth-card {
  width: 380px;
  text-align: center;
  padding: 8px;
}
.auth-card h1 {
  margin-bottom: 4px;
}
.w-full {
  width: 100%;
}
.links {
  margin-top: 16px;
  font-size: 13px;
}
</style>
