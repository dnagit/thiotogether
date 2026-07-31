<script setup lang="ts">
import { computed, onErrorCaptured, ref } from 'vue';
import { useRoute } from 'vue-router';
import SiteHeader from '@/components/layout/SiteHeader.vue';
import SiteFooter from '@/components/layout/SiteFooter.vue';
import { useSiteStore } from '@/stores/site';

const site = useSiteStore();
const route = useRoute();
/**
 * Pages that open with a full-bleed banner run under the transparent header instead of clearing it:
 * home, plus any route flagged with `meta.underHeader`.
 */
const underHeader = computed(() => route.path === '/' || route.meta.underHeader === true);
const ready = ref(false);
const failed = ref(false);

site
  .init()
  .catch(() => (failed.value = true))
  .finally(() => (ready.value = true));

onErrorCaptured((err) => {
  console.error('Unhandled component error', err);
  return false;
});
</script>

<template>
  <div v-if="!ready" class="boot">
    <div class="animate-pulse text-gray-400">Loading…</div>
  </div>
  <div v-else-if="failed" class="boot">
    <div class="text-center">
      <h1 class="text-2xl font-bold mb-2">Site temporarily unavailable</h1>
      <p class="text-gray-500">Please try again in a moment.</p>
    </div>
  </div>
  <template v-else>
    <SiteHeader />
    <!-- `page-bg` paints the shared backdrop once here, so every route gets it without opting in. -->
    <main class="page-bg min-h-[60vh]" :class="underHeader ? '' : 'pt-[var(--header-h)]'">
      <RouterView />
    </main>
    <SiteFooter />
  </template>
</template>

<style scoped>
.boot {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
