<script setup lang="ts">
/**
 * Token balance lookup by account name. The endpoint is rate limited server-side
 * because the response is exactly what a name-guesser would want; the 429 gets a
 * plain-language message rather than a raw error.
 */
import { ref } from 'vue';
import { api } from '@/api/client';
import { applySeo } from '@/composables/useSeo';

interface Result {
  found: boolean;
  displayName?: string;
  total: number;
  byProject: Array<{ projectId: number; name: string; slug: string; tokens: number }>;
  pendingDonations: number;
}

const accountName = ref('');
const result = ref<Result | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

applySeo({ title: 'ตรวจสอบ Token ของฉัน' });

async function check(): Promise<void> {
  const name = accountName.value.trim();
  if (name.length < 2) {
    error.value = 'กรุณากรอกชื่อบัญชีอย่างน้อย 2 ตัวอักษร';
    return;
  }
  loading.value = true;
  error.value = null;
  result.value = null;
  try {
    const { data } = await api.post('/public/tokens/check', { accountName: name });
    result.value = data.data;
  } catch (err: any) {
    error.value =
      err?.response?.status === 429
        ? 'ตรวจสอบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่'
        : (err?.response?.data?.message ?? 'ตรวจสอบไม่สำเร็จ กรุณาลองใหม่');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="container-site py-12 max-w-2xl">
    <header class="text-center mb-8">
      <h1 class="text-3xl font-extrabold mb-2">ตรวจสอบ Token ของฉัน</h1>
      <p class="text-gray-500">กรอกชื่อบัญชีเดียวกับที่ใช้ตอนบริจาค</p>
    </header>

    <form class="flex flex-col sm:flex-row gap-2 mb-6" @submit.prevent="check">
      <label for="token-account" class="sr-only">ชื่อบัญชี</label>
      <input
        id="token-account"
        v-model="accountName"
        type="text"
        maxlength="190"
        autocomplete="name"
        placeholder="เช่น สมชาย ใจดี"
        class="flex-1 rounded-lg border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        :aria-invalid="!!error"
        aria-describedby="token-error"
      />
      <button type="submit" class="btn-primary" :disabled="loading">
        {{ loading ? 'กำลังตรวจสอบ…' : 'ตรวจสอบ' }}
      </button>
    </form>

    <p v-if="error" id="token-error" class="text-center text-red-600 mb-6" role="alert">{{ error }}</p>

    <div v-if="result" role="status" aria-live="polite">
      <!-- No account -->
      <div v-if="!result.found" class="card text-center">
        <div class="text-5xl mb-3" aria-hidden="true">🔍</div>
        <h2 class="font-bold text-lg mb-1">ไม่พบบัญชีนี้ในระบบ</h2>
        <p class="text-gray-600 mb-4 text-sm">
          ตรวจสอบการสะกดอีกครั้ง หรือหากเพิ่งบริจาค Token จะเข้าหลังผู้ดูแลตรวจสอบสลิปแล้ว
        </p>
        <RouterLink to="/donation" class="btn-primary inline-block">ไปหน้าบริจาค</RouterLink>
      </div>

      <!-- Found -->
      <template v-else>
        <div class="card text-center mb-4">
          <p class="text-sm text-gray-500">บัญชี</p>
          <p class="font-bold text-lg">{{ result.displayName }}</p>
          <p class="text-5xl font-extrabold my-3 text-blue-600">{{ result.total }}</p>
          <p class="text-gray-600">Token ที่ใช้ได้</p>
        </div>

        <div v-if="result.pendingDonations > 0" class="notice mb-4">
          ⏳ มีรายการบริจาค {{ result.pendingDonations }} รายการกำลังรอตรวจสอบ —
          Token จะเพิ่มให้อัตโนมัติเมื่อผู้ดูแลอนุมัติแล้ว
        </div>

        <div v-if="result.byProject.length > 0" class="card mb-4">
          <h2 class="font-bold mb-3">แยกตามโครงการ</h2>
          <ul class="divide-y divide-gray-100" role="list">
            <li v-for="p in result.byProject" :key="p.projectId" class="flex justify-between items-center py-2.5">
              <RouterLink :to="`/donation/${p.slug}`" class="hover:underline">{{ p.name }}</RouterLink>
              <span class="font-bold">{{ p.tokens }} Token</span>
            </li>
          </ul>
          <p class="text-xs text-gray-500 mt-3">
            Token ใช้ได้เฉพาะเกมส์ที่โครงการนั้นเข้าร่วมเท่านั้น
          </p>
        </div>

        <div v-if="result.total > 0" class="text-center">
          <RouterLink to="/games" class="btn-primary inline-block">ไปเลือกเปิดป้าย</RouterLink>
        </div>
        <div v-else class="text-center">
          <RouterLink to="/donation" class="btn-primary inline-block">บริจาคเพื่อรับ Token</RouterLink>
        </div>
      </template>
    </div>

    <p class="text-xs text-gray-400 text-center mt-10">
      หมายเหตุ: ระบบระบุตัวตนจากชื่อบัญชีเท่านั้น ไม่มีการล็อกอิน
      โปรดเก็บชื่อบัญชีของคุณเป็นความลับ · <RouterLink to="/privacy" class="underline">นโยบายความเป็นส่วนตัว</RouterLink>
    </p>
  </div>
</template>

<style scoped>
.card { @apply bg-white border border-gray-100 rounded-2xl p-6 shadow-sm; }
.notice { @apply bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 text-sm; }
.btn-primary {
  @apply bg-blue-600 text-white font-semibold px-6 py-3 rounded-lg transition hover:bg-blue-700 disabled:opacity-50;
}
</style>
