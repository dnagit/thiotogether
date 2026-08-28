<script setup lang="ts">
/**
 * The wish wall as a CMS block, so a birthday can be dropped into any page rather than
 * living only at /birthday. Same balloons, same popup — only shorter, since it shares the
 * page with whatever the admin put above and below it.
 *
 * Block props (set in the admin):
 *   slug      — which birthday event to show; defaults to "birthday"
 *   title     — optional heading above the balloons
 *   height    — CSS height for the flight window, e.g. "70vh" or "520px"
 *   ctaLabel  — text for the link to the form; omit to hide the link
 */
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useBirthdayWall } from '@/composables/useBirthdayWall';
import BalloonSky from '@/components/birthday/BalloonSky.vue';

const props = withDefaults(
  defineProps<{
    slug?: string;
    title?: string;
    height?: string;
    ctaLabel?: string;
  }>(),
  { slug: 'birthday', title: '', height: '70svh', ctaLabel: 'Float a wish' },
);

const reading = ref(false);
const { event, wishes, loading } = useBirthdayWall(props.slug, { paused: () => reading.value });

const themeColor = computed(() => event.value?.themeColor ?? '#ea480c');
</script>

<template>
  <div class="py-8">
    <h2 v-if="title" class="mb-4 text-center text-2xl font-extrabold sm:text-3xl">{{ title }}</h2>

    <div v-if="loading" class="py-16 text-center text-gray-400 animate-pulse">Loading wishes…</div>

    <p v-else-if="!wishes.length" class="py-12 text-center text-gray-500">
      No wishes yet — be the first 🎈
    </p>

    <BalloonSky
      v-else
      :wishes="wishes"
      :height="height"
      :slug="slug"
      :theme-color="themeColor"
      @update:reading="reading = $event"
    />

    <div v-if="ctaLabel" class="mt-6 text-center">
      <RouterLink
        :to="{ name: 'birthday-wish', params: { slug } }"
        class="cta-btn"
        :style="{ background: themeColor }"
      >
        {{ ctaLabel }}
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.cta-btn {
  @apply inline-block rounded-full px-7 py-3 font-semibold text-white transition hover:opacity-90;
}
</style>
