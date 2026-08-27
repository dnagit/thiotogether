<script setup lang="ts">
/**
 * The site: dynamic header, the page, the footer.
 *
 * What every route gets unless it names another layout. Lifted out of `App.vue` when the
 * birthday pages needed chrome of their own — see {@link BirthdayLayout} — so that
 * `App.vue` is left doing only the one job no layout can do, which is booting the site.
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import SiteHeader from '@/components/layout/SiteHeader.vue';
import SiteFooter from '@/components/layout/SiteFooter.vue';
import SitePopup from '@/components/SitePopup.vue';

const route = useRoute();
/**
 * Pages that open with a full-bleed banner run under the transparent header instead of
 * clearing it: home, plus any route flagged with `meta.underHeader`.
 */
const underHeader = computed(() => route.path === '/' || route.meta.underHeader === true);
</script>

<template>
  <SiteHeader />
  <!-- `page-bg` paints the shared backdrop once here, so every route gets it without opting in. -->
  <main class="page-bg min-h-[60vh]" :class="underHeader ? '' : 'pt-[var(--header-h)]'">
    <slot />
  </main>
  <SiteFooter />
  <!-- Teleports itself to the body; mounted here so it rides on the site's own chrome and
       leaves the birthday pages alone. -->
  <SitePopup />
</template>
