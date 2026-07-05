<script setup lang="ts">
import { ref } from 'vue';
import { get } from '@/api/client';
import { applySeo } from '@/composables/useSeo';
import { formatCurrency, type DonationProject } from '@cms/shared';

const projects = ref<DonationProject[]>([]);
const loading = ref(true);

applySeo({ title: 'Donation Projects' });

void get<DonationProject[]>('/donation-projects')
  .then((p) => (projects.value = p))
  .finally(() => (loading.value = false));
</script>

<template>
  <div class="container-site py-12">
    <h1 class="text-4xl font-extrabold text-center mb-2">Donation Projects</h1>
    <p class="text-center text-gray-500 mb-10">Choose a campaign and make a difference today.</p>

    <div v-if="loading" class="py-16 text-center text-gray-400 animate-pulse">Loading…</div>

    <div v-else class="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
      <RouterLink
        v-for="project in projects"
        :key="project.id"
        :to="`/donation/${project.slug}`"
        class="block bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-lg transition overflow-hidden"
      >
        <img
          v-if="project.coverImage"
          :src="project.coverImage"
          :alt="project.name"
          loading="lazy"
          class="w-full h-48 object-cover"
        />
        <div v-else class="w-full h-48 flex items-center justify-center text-5xl" :style="{ background: project.themeColor ?? 'var(--color-primary)', opacity: 0.85 }">💝</div>

        <div class="p-6">
          <h2 class="font-bold text-xl mb-1">{{ project.name }}</h2>
          <p class="text-sm text-gray-600 mb-4 line-clamp-2">{{ project.shortDescription }}</p>

          <div class="h-2.5 bg-gray-100 rounded-full overflow-hidden mb-2">
            <div
              class="h-full rounded-full transition-all"
              :style="{ width: `${project.stats?.progressPercent ?? 0}%`, background: project.themeColor ?? 'var(--color-primary)' }"
            />
          </div>
          <div class="flex justify-between text-sm">
            <span class="font-semibold">{{ formatCurrency(project.stats?.currentAmount ?? 0, project.currency) }}</span>
            <span class="text-gray-500">of {{ formatCurrency(Number(project.targetAmount), project.currency) }}</span>
          </div>
          <div class="text-xs text-gray-400 mt-2">
            {{ project.stats?.donorCount ?? 0 }} donor(s) · {{ project.stats?.progressPercent ?? 0 }}% funded
          </div>
        </div>
      </RouterLink>
    </div>

    <p v-if="!loading && !projects.length" class="text-center text-gray-400 py-16">No active campaigns right now.</p>
  </div>
</template>
