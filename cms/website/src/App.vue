<script setup lang="ts">
/**
 * Boot, then hand the page to a layout.
 *
 * The site settings have to be in before anything renders — the header reads the logo and
 * the menu from them — so that wait lives here, above every layout. What the page is then
 * wrapped in comes from `meta.layout` on the route: no flag means the site's own chrome.
 */
import { computed, onErrorCaptured, ref } from 'vue';
import { useRoute } from 'vue-router';
import DefaultLayout from '@/layouts/DefaultLayout.vue';
import BirthdayLayout from '@/layouts/BirthdayLayout.vue';
import { useSiteStore } from '@/stores/site';

const site = useSiteStore();
const route = useRoute();

const layouts = { default: DefaultLayout, birthday: BirthdayLayout };
const layout = computed(() => layouts[route.meta.layout ?? 'default']);

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
  <component :is="layout" v-else>
    <RouterView />
  </component>
</template>

<style scoped>
.boot {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
