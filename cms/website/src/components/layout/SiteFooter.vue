<script setup lang="ts">
import { computed, ref } from 'vue';
import { useSiteStore } from '@/stores/site';
import MenuLink from './MenuLink.vue';
import type { MenuItem } from '@cms/shared';

const site = useSiteStore();
const menu = ref<{ items?: MenuItem[] } | null>(null);
void site.loadMenu('footer').then((m) => (menu.value = m));

const social = computed(() => Object.entries((site.settings?.socialLinks ?? {}) as Record<string, string>).filter(([, url]) => url));
const footerText = computed(() => site.theme.footerText || `© ${new Date().getFullYear()} ${site.siteName}`);

/**
 * The animated mascot is a 21 MB GIF, so it is only requested once a pointer actually reaches it —
 * never as part of the initial page weight. The still frame stays mounted underneath so the swap
 * has something to show while the animation downloads.
 */
const mascotHovered = ref(false);
const mascotAnimationRequested = ref(false);

function onMascotEnter(): void {
  mascotHovered.value = true;
  mascotAnimationRequested.value = true;
}
</script>

<template>
  <!-- No backdrop colour at all: the artwork is the footer. Its canvas is transparent above the hill,
       so the page shows through and the graphic reads as part of the page rather than a dark band. -->
  <footer class="relative overflow-hidden mt-16 text-gray-700">
    <!-- <div class="container-site py-12 grid gap-8 md:grid-cols-3">
      <div>
        <h3 class="text-white font-bold text-lg mb-2">{{ site.siteName }}</h3>
        <p class="text-sm">{{ site.settings?.siteDescription }}</p>
      </div>
      <div>
        <h4 class="text-white font-semibold mb-3">Links</h4>
        <ul class="space-y-2 text-sm">
          <li v-for="item in menu?.items ?? []" :key="item.id">
            <MenuLink :item="item" class="hover:opacity-80">{{ item.label }}</MenuLink>
          </li>
        </ul>
      </div>
      <div>
        <h4 class="text-white font-semibold mb-3">Contact</h4>
        <ul class="space-y-2 text-sm">
          <li v-if="site.settings?.contactEmail">✉️ {{ site.settings.contactEmail }}</li>
          <li v-if="site.settings?.contactPhone">📞 {{ site.settings.contactPhone }}</li>
          <li v-if="site.settings?.contactAddress">📍 {{ site.settings.contactAddress }}</li>
        </ul>
        <div class="flex gap-3 mt-4">
          <a v-for="[name, url] in social" :key="name" :href="url" target="_blank" rel="noopener" class="capitalize text-sm hover:opacity-80">
            {{ name }}
          </a>
        </div>
      </div>
    </div> -->
    <!--
      Full-bleed artwork anchored to the bottom edge. Only the lower 37% of the canvas is drawn, so
      the transparent remainder overflows above and is clipped — that keeps the hill's scale tied to
      the page width without the empty part padding the footer out.
    -->
    <img
      src="/images/bg-footer.png"
      alt=""
      aria-hidden="true"
      class="pointer-events-none select-none absolute inset-x-0 bottom-0 w-full h-auto max-w-none"
    />
    <!--
      Mascot standing on the crest, sized purely in vw like the hill it stands on (which is 21.4vw
      tall) so the pair keeps its proportions at every width. The summit sits 14.42vw above the
      footer's bottom edge and the square canvas carries 22.9% empty space under the feet
      (2048px tall, feet at 1579px), so 14.42 - 0.229 x 12 = 11.67vw plants it on the slope. Clamping
      the width would break that relationship at the clamped ends.
    -->
    <div
      class="absolute left-1/2 -translate-x-1/2 bottom-[11.67vw] w-[12vw]"
      @mouseenter="onMascotEnter"
      @mouseleave="mascotHovered = false"
    >
      <img
        src="/images/SunflowerJiew.png"
        alt=""
        aria-hidden="true"
        class="w-full h-auto select-none transition-opacity"
        :class="mascotHovered && mascotAnimationRequested ? 'opacity-0' : 'opacity-100'"
      />
      <img
        v-if="mascotAnimationRequested"
        src="/images/SunflowerJiew.gif"
        alt=""
        aria-hidden="true"
        class="absolute inset-0 w-full h-auto select-none transition-opacity"
        :class="mascotHovered ? 'opacity-100' : 'opacity-0'"
      />
    </div>

    <!--
      Sits on the hill itself. Both the offset from the bottom and the type size are viewport-derived,
      like the artwork they sit on, so the line keeps the same place on the slope at any width.
    -->
    <div
      class="absolute inset-x-0 bottom-[2.5vw] mx-auto max-w-[70%] px-4 text-center text-white leading-snug
             text-[clamp(0.45rem,0.85vw,0.8rem)] [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]"
             v-html="footerText"
    >
    
    </div>
    <!--
      Reserves the footer's height. The hill needs 21.4vw (36.8% of a 1.72:1 canvas), but the mascot
      standing on it reaches higher — 11.67vw of offset plus its own 12vw — and the footer clips its
      overflow, so the taller of the two wins.
    -->
    <div class="h-[23.7vw]" aria-hidden="true"></div>
  </footer>
</template>
