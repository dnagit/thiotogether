<script setup lang="ts">
/**
 * A winged medal for places 1–3: gold on a red ribbon, silver on blue, bronze on green.
 * Drawn rather than an image so it stays sharp at any size and costs no request.
 */
import { computed, useId } from 'vue';

const props = withDefaults(defineProps<{ rank: 1 | 2 | 3; size?: string }>(), { size: '3rem' });

const METALS = {
  1: { light: '#fff3b0', mid: '#fbbf24', dark: '#b45309', ribbon: '#dc2626', ribbonDark: '#991b1b' },
  2: { light: '#ffffff', mid: '#cbd5e1', dark: '#64748b', ribbon: '#3b82f6', ribbonDark: '#1d4ed8' },
  3: { light: '#ffe4c7', mid: '#f59e5b', dark: '#9a3412', ribbon: '#22c55e', ribbonDark: '#15803d' },
} as const;

const c = computed(() => METALS[props.rank]);
// Several medals share a page; each needs gradients of its own.
const id = useId();
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 64 72" aria-hidden="true" class="medal">
    <defs>
      <linearGradient :id="`${id}-disc`" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" :stop-color="c.light" />
        <stop offset="0.55" :stop-color="c.mid" />
        <stop offset="1" :stop-color="c.dark" />
      </linearGradient>
      <linearGradient :id="`${id}-wing`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" :stop-color="c.light" />
        <stop offset="1" :stop-color="c.mid" />
      </linearGradient>
    </defs>
    <!-- Ribbon -->
    <rect x="18" y="1" width="28" height="4" rx="1" :fill="c.dark" />
    <path d="M19 5 L45 5 L32 22 Z" :fill="c.ribbon" />
    <path d="M24 5 L40 5 L32 16 Z" :fill="c.ribbonDark" opacity="0.55" />
    <circle cx="32" cy="24" r="3.2" :fill="c.mid" :stroke="c.dark" stroke-width="1" />
    <!-- Wings -->
    <g :fill="`url(#${id}-wing)`">
      <ellipse cx="11" cy="44" rx="9" ry="4.5" transform="rotate(-35 11 44)" />
      <ellipse cx="9" cy="52" rx="8" ry="4" transform="rotate(-10 9 52)" />
      <ellipse cx="53" cy="44" rx="9" ry="4.5" transform="rotate(35 53 44)" />
      <ellipse cx="55" cy="52" rx="8" ry="4" transform="rotate(10 55 52)" />
    </g>
    <!-- Disc -->
    <circle cx="32" cy="48" r="20" :fill="`url(#${id}-disc)`" />
    <circle cx="32" cy="48" r="14.5" fill="none" :stroke="c.light" stroke-width="2.2" opacity="0.8" />
    <path
      d="M32 38.5 l2.9 5.9 6.5 0.9 -4.7 4.6 1.1 6.5 -5.8 -3.1 -5.8 3.1 1.1 -6.5 -4.7 -4.6 6.5 -0.9 z"
      :fill="c.dark"
      opacity="0.85"
    />
  </svg>
</template>

<style scoped>
.medal {
  display: block;
  flex: 0 0 auto;
  filter: drop-shadow(0 2px 2px rgb(0 0 0 / 0.25));
}
</style>
