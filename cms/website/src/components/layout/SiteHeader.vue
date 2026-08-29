<script setup lang="ts">
/** Header with fully dynamic navigation — no hardcoded links anywhere. */
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useSiteStore } from '@/stores/site';
import MenuLink from './MenuLink.vue';
import type { MenuItem } from '@cms/shared';

const site = useSiteStore();
const route = useRoute();
const menu = ref<{ items?: MenuItem[] } | null>(null);
const navOpen = ref(false);

void site.loadMenu('main').then((m) => (menu.value = m));

const items = computed(() => (menu.value?.items ?? []) as MenuItem[]);
const logo = computed(() => site.theme.logoUrl);

watch(() => route.fullPath, () => (navOpen.value = false));
</script>

<template>
  <!--
    In the flow of the page, not pinned over it. `relative` is still needed: the nav panel
    below hangs off the bar with `top-full`, and `z-40` keeps that panel above the page it
    opens across.
  -->
  <header class="relative z-40 bg-transparent">
    <div class="container-site flex items-center h-[var(--header-h)]">
      <!-- Menu toggle (left, all breakpoints) -->
      <button class="p-2 -ml-2 shrink-0 text-[#ea480c]" aria-label="Menu" :aria-expanded="navOpen" @click="navOpen = !navOpen">
        <svg class="w-[var(--burger-size)] h-[var(--burger-size)]" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <path v-if="!navOpen" d="M4 6h16M4 12h16M4 18h16" stroke-linecap="round" />
          <path v-else d="M6 6l12 12M18 6L6 18" stroke-linecap="round" />
        </svg>
      </button>

      <!-- Logo (centered) -->
      <RouterLink to="/" class="flex-1 flex items-center justify-center gap-2 font-bold text-lg min-w-0">
        <img v-if="logo" :src="logo" alt="" class="h-[var(--header-h)] w-auto max-w-full object-contain" />
        <span v-else class="truncate">{{ site.siteName }}</span>
      </RouterLink>

      <!-- Spacer keeping the logo optically centered -->
      <div class="w-[calc(var(--burger-size)+0.5rem)] shrink-0" aria-hidden="true"></div>
    </div>

    <!--
      Nav panel: overlays the page so opening it never pushes content down. Its gradient is sampled
      from the banner artwork (cream #efe9c9 at the top through to the yellow sky #fde164) and kept
      translucent, with a backdrop blur so the page stays legible behind it.
    -->
    <nav
      v-if="navOpen"
      class="absolute inset-x-0 top-full max-h-[calc(100vh-var(--header-h))] overflow-y-auto
             border-t border-white/40 text-gray-900 shadow-lg px-4 py-3 space-y-1
             bg-gradient-to-b from-[#efe9c9]/90 via-[#f6de8f]/90 to-[#fde164]/90 backdrop-blur-md"
    >
      <template v-for="item in items" :key="item.id">
        <MenuLink :item="item" class="block py-2 font-medium" @click="navOpen = false">{{ item.label }}</MenuLink>
        <template v-for="child in item.children ?? []" :key="child.id">
          <MenuLink :item="child" class="block py-1.5 pl-4 text-sm text-gray-600" @click="navOpen = false">{{ child.label }}</MenuLink>
          <MenuLink
            v-for="grand in child.children ?? []"
            :key="grand.id"
            :item="grand"
            class="block py-1.5 pl-8 text-sm text-gray-500"
            @click="navOpen = false"
          >{{ grand.label }}</MenuLink>
        </template>
      </template>
    </nav>
  </header>
</template>
