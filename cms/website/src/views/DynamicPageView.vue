<script setup lang="ts">
/**
 * Catch-all view: resolves the current URL path against the CMS and renders
 * the page's blocks through the ComponentRenderer. Unknown paths → 404.
 */
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { get } from '@/api/client';
import { applySeo } from '@/composables/useSeo';
import ComponentRenderer from '@/components/ComponentRenderer.vue';
import type { Page } from '@cms/shared';

const route = useRoute();
const router = useRouter();
const page = ref<Page | null>(null);
const loading = ref(true);

async function load(path: string): Promise<void> {
  loading.value = true;
  page.value = null;
  try {
    page.value = await get<Page>('/pages/resolve', { path: path || '/' });
    applySeo({ ...page.value, title: page.value.title });
  } catch (err: any) {
    if (err?.response?.status === 404) {
      void router.replace({ name: 'not-found', query: { from: path } });
    } else {
      void router.replace({ name: 'server-error' });
    }
  } finally {
    loading.value = false;
  }
}

watch(() => route.path, (p) => void load(p), { immediate: true });
</script>

<template>
  <div v-if="loading" class="py-24 text-center text-gray-400 animate-pulse">Loading…</div>
  <template v-else-if="page">
    <ComponentRenderer :blocks="page.blocks ?? []" />
  </template>
</template>
