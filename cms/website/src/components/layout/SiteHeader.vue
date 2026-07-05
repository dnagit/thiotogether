<script setup lang="ts">
/** Header with fully dynamic navigation — no hardcoded links anywhere. */
import { computed, ref } from 'vue';
import { useSiteStore } from '@/stores/site';
import MenuLink from './MenuLink.vue';
import type { MenuItem } from '@cms/shared';

const site = useSiteStore();
const menu = ref<{ items?: MenuItem[] } | null>(null);
const mobileOpen = ref(false);

void site.loadMenu('main').then((m) => (menu.value = m));

const items = computed(() => (menu.value?.items ?? []) as MenuItem[]);
const logo = computed(() => site.theme.logoUrl);
</script>

<template>
  <header class="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-gray-100">
    <div class="container-site flex items-center justify-between h-16">
      <RouterLink to="/" class="flex items-center gap-2 font-bold text-lg">
        <img v-if="logo" :src="logo" alt="" class="h-8 w-auto" />
        <span v-else>{{ site.siteName }}</span>
      </RouterLink>

      <!-- Desktop nav -->
      <nav class="hidden md:flex items-center gap-1">
        <div v-for="item in items" :key="item.id" class="relative group">
          <MenuLink :item="item" class="px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100 inline-flex items-center gap-1">
            {{ item.label }}
            <svg v-if="item.children?.length" class="w-3 h-3" viewBox="0 0 12 12" fill="currentColor"><path d="M2 4l4 4 4-4z" /></svg>
          </MenuLink>
          <!-- Dropdown (one nested level shown; deeper levels indent) -->
          <div
            v-if="item.children?.length"
            class="absolute left-0 top-full hidden group-hover:block bg-white border border-gray-100 rounded-lg shadow-lg py-2 min-w-[220px]"
          >
            <template v-for="child in item.children" :key="child.id">
              <MenuLink :item="child" class="block px-4 py-2 text-sm hover:bg-gray-50">{{ child.label }}</MenuLink>
              <MenuLink
                v-for="grand in child.children ?? []"
                :key="grand.id"
                :item="grand"
                class="block pl-8 pr-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >{{ grand.label }}</MenuLink>
            </template>
          </div>
        </div>
      </nav>

      <!-- Mobile toggle -->
      <button class="md:hidden p-2" aria-label="Menu" @click="mobileOpen = !mobileOpen">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path v-if="!mobileOpen" d="M4 6h16M4 12h16M4 18h16" stroke-linecap="round" />
          <path v-else d="M6 6l12 12M18 6L6 18" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <!-- Mobile nav -->
    <nav v-if="mobileOpen" class="md:hidden border-t border-gray-100 bg-white px-4 py-3 space-y-1">
      <template v-for="item in items" :key="item.id">
        <MenuLink :item="item" class="block py-2 font-medium" @click="mobileOpen = false">{{ item.label }}</MenuLink>
        <MenuLink
          v-for="child in item.children ?? []"
          :key="child.id"
          :item="child"
          class="block py-1.5 pl-4 text-sm text-gray-600"
          @click="mobileOpen = false"
        >{{ child.label }}</MenuLink>
      </template>
    </nav>
  </header>
</template>
