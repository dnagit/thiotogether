<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { get } from '@/api/client';
import { applySeo } from '@/composables/useSeo';
import { formatCurrency, formatDateTime } from '@cms/shared';

const route = useRoute();
const donation = ref<any | null>(null);
const notFound = ref(false);
const loading = ref(true);

applySeo({ title: 'Donation Status', noIndex: true });

void get<any>(`/donations/${route.params.code}/status`)
  .then((d) => (donation.value = d))
  .catch(() => (notFound.value = true))
  .finally(() => (loading.value = false));

const statusInfo: Record<string, { label: string; icon: string; class: string }> = {
  PENDING: { label: 'Pending Verification', icon: '⏳', class: 'text-amber-600 bg-amber-50' },
  AUTO_VERIFIED: { label: 'Transfer Slip Verified ✅', icon: '🤖', class: 'text-green-700 bg-green-50' },
  VERIFIED: { label: 'Verified — Thank you!', icon: '✅', class: 'text-green-700 bg-green-50' },
  NEEDS_REVIEW: { label: 'Under Manual Review', icon: '🔍', class: 'text-blue-700 bg-blue-50' },
  REJECTED: { label: 'Rejected', icon: '❌', class: 'text-red-700 bg-red-50' },
};
</script>

<template>
  <div class="container-site py-20 max-w-lg">
    <h1 class="text-3xl font-bold text-center mb-8">Donation Status</h1>

    <div v-if="loading" class="text-center text-gray-400 animate-pulse py-12">Checking…</div>

    <div v-else-if="notFound" class="text-center py-12">
      <div class="text-5xl mb-4">🔎</div>
      <p class="text-gray-600">We couldn't find a donation with code <b>{{ route.params.code }}</b>.</p>
    </div>

    <div v-else-if="donation" class="bg-white border border-gray-100 rounded-2xl shadow-sm p-8">
      <div class="text-center mb-6">
        <div class="text-5xl mb-3">{{ statusInfo[donation.status]?.icon }}</div>
        <span class="inline-block px-4 py-1.5 rounded-full font-semibold text-sm" :class="statusInfo[donation.status]?.class">
          {{ statusInfo[donation.status]?.label ?? donation.status }}
        </span>
      </div>
      <dl class="space-y-3 text-sm">
        <div class="flex justify-between"><dt class="text-gray-500">Donation ID</dt><dd class="font-mono font-semibold">{{ donation.donationCode }}</dd></div>
        <div class="flex justify-between"><dt class="text-gray-500">Project</dt><dd class="font-semibold">{{ donation.projectName }}</dd></div>
        <div class="flex justify-between"><dt class="text-gray-500">Amount</dt><dd class="font-semibold">{{ formatCurrency(donation.amount, donation.currency) }}</dd></div>
        <div class="flex justify-between"><dt class="text-gray-500">Submitted</dt><dd>{{ formatDateTime(donation.createdAt) }}</dd></div>
      </dl>
      <RouterLink to="/donation" class="btn-primary w-full text-center block mt-8" style="background-color: #ea480c;">Support Another Project</RouterLink>
    </div>
  </div>
</template>
