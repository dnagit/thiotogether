<script setup lang="ts">
/**
 * The site: dynamic header, the page, the footer.
 *
 * What every route gets unless it names another layout. Lifted out of `App.vue` when the
 * birthday pages needed chrome of their own — see {@link BirthdayLayout} — so that
 * `App.vue` is left doing only the one job no layout can do, which is booting the site.
 */
import SiteHeader from '@/components/layout/SiteHeader.vue';
import SiteFooter from '@/components/layout/SiteFooter.vue';
import SitePopup from '@/components/SitePopup.vue';

/*
 * No padding under the header, on any page — and that is true of both kinds now.
 *
 * A page that runs under the bar wants its banner to start at the very top, and a page that
 * does not gets the space from the bar itself, which stands in the flow above this. The old
 * padding existed only because the bar was fixed and therefore took no space on either.
 * `SiteHeader` decides which of the two a page is.
 */
</script>

<template>
  <SiteHeader />
  <!-- `page-bg` paints the shared backdrop once here, so every route gets it without opting in. -->
  <main class="page-bg min-h-[60vh]">
    <slot />
  </main>
  <SiteFooter />
  <!-- Teleports itself to the body; mounted here so it rides on the site's own chrome and
       leaves the birthday pages alone. -->
  <SitePopup />
</template>
