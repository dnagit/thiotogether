<script setup lang="ts">
/** Renders a menu item as RouterLink (internal) or <a> (external/anchor). */
import { computed } from 'vue';
import type { MenuItem } from '@cms/shared';

const props = defineProps<{ item: MenuItem }>();

const isExternal = computed(
  () => props.item.type === 'EXTERNAL' || /^https?:\/\//.test(props.item.url ?? ''),
);
const isAnchor = computed(() => (props.item.url ?? '').startsWith('#'));
</script>

<template>
  <a v-if="isExternal || isAnchor" :href="item.url ?? '#'" :target="item.target">
    <slot />
  </a>
  <RouterLink v-else :to="item.url ?? '#'" :target="item.target">
    <slot />
  </RouterLink>
</template>
