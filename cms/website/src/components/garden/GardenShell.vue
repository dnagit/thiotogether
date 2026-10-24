<script setup lang="ts">
/**
 * Chrome for the garden pages: a sky, a slim bar with the garden's three places — sow, the
 * field, my garden — and the page beneath. A garden is reached by QR code and stands on its
 * own, like the birthday wall, so the site's own header stays out of it.
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const props = defineProps<{ slug: string; title?: string | null; themeColor?: string | null }>();
const route = useRoute();

const links = computed(() => [
  { name: 'garden-plant', label: 'ปลูก', to: `/garden/plant/${props.slug}` },
  { name: 'garden-field', label: 'แปลงรวม', to: `/garden/${props.slug}` },
  { name: 'garden-mine', label: 'สวนของฉัน', to: `/garden/mine/${props.slug}` },
]);
</script>

<template>
  <div class="garden-shell" :style="{ '--garden-theme': themeColor || '#f59e0b' }">
    <header class="garden-bar">
      <RouterLink :to="`/garden/${slug}`" class="garden-brand"
        >🌻 {{ title || 'สวนทานตะวัน' }}</RouterLink
      >
      <nav class="garden-nav">
        <RouterLink
          v-for="link in links"
          :key="link.name"
          :to="link.to"
          class="garden-tab"
          :class="{ 'garden-tab-on': route.name === link.name }"
        >
          {{ link.label }}
        </RouterLink>
      </nav>
    </header>
    <main class="garden-main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.garden-shell {
  min-height: 100svh;
  background: linear-gradient(#bae6fd 0%, #e0f2fe 30%, #fef9c3 75%, #fde68a 100%);
  color: #1f2937;
}
.garden-bar {
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 16px;
  background: rgb(255 255 255 / 0.85);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid rgb(0 0 0 / 0.06);
}
.garden-brand {
  font-weight: 800;
  color: #92400e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 60vw;
}
.garden-nav {
  display: flex;
  gap: 4px;
}
.garden-tab {
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #78350f;
}
.garden-tab-on {
  background: var(--garden-theme);
  color: #fff;
}
.garden-main {
  padding: 16px 16px 48px;
  max-width: 1100px;
  margin: 0 auto;
}
</style>
