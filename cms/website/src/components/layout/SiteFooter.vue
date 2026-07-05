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
</script>

<template>
  <footer class="bg-gray-900 text-gray-300 mt-16">
    <div class="container-site py-12 grid gap-8 md:grid-cols-3">
      <div>
        <h3 class="text-white font-bold text-lg mb-2">{{ site.siteName }}</h3>
        <p class="text-sm text-gray-400">{{ site.settings?.siteDescription }}</p>
      </div>
      <div>
        <h4 class="text-white font-semibold mb-3">Links</h4>
        <ul class="space-y-2 text-sm">
          <li v-for="item in menu?.items ?? []" :key="item.id">
            <MenuLink :item="item" class="hover:text-white">{{ item.label }}</MenuLink>
          </li>
        </ul>
      </div>
      <div>
        <h4 class="text-white font-semibold mb-3">Contact</h4>
        <ul class="space-y-2 text-sm text-gray-400">
          <li v-if="site.settings?.contactEmail">✉️ {{ site.settings.contactEmail }}</li>
          <li v-if="site.settings?.contactPhone">📞 {{ site.settings.contactPhone }}</li>
          <li v-if="site.settings?.contactAddress">📍 {{ site.settings.contactAddress }}</li>
        </ul>
        <div class="flex gap-3 mt-4">
          <a v-for="[name, url] in social" :key="name" :href="url" target="_blank" rel="noopener" class="capitalize text-sm hover:text-white">
            {{ name }}
          </a>
        </div>
      </div>
    </div>
    <div class="border-t border-gray-800 py-4 text-center text-xs text-gray-500">{{ footerText }}</div>
  </footer>
</template>
