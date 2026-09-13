<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    slides?: Array<{ image: string; title?: string; text?: string; url?: string }>;
    autoplay?: boolean;
    interval?: number;
  }>(),
  { slides: () => [], autoplay: true, interval: 5000 },
);

/**
 * The dots. The lit one is a fixed orange rather than the site's `--color-primary`, which is
 * set per site from the CMS theme — this slider wants the one colour wherever it appears. The
 * unlit one stays grey: two dots the same colour say which slides exist but not which you are
 * on, which is the only thing the dots are for.
 */
const DOT_ACTIVE = 'rgb(234, 72, 12)';
const DOT_IDLE = '#d1d5db';

const current = ref(0);
const isSingle = computed(() => props.slides.length === 1);
let timer: ReturnType<typeof setInterval> | undefined;

function isExternal(url?: string): boolean {
  return !!url && /^https?:\/\//i.test(url);
}

function go(i: number): void {
  current.value = (i + props.slides.length) % props.slides.length;
}

onMounted(() => {
  if (props.autoplay && props.slides.length > 1) {
    timer = setInterval(() => go(current.value + 1), props.interval);
  }
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <div v-if="slides.length" class="relative py-10">
    <!--
      The slides are stacked in one grid cell rather than positioned absolutely over a box of
      a fixed height. A fixed height forced `object-cover` on every slide, which cropped the
      top and bottom off — and these are banners with their wording drawn into the artwork,
      so what it cropped was the message. Stacked, each slide keeps its own aspect ratio and
      the box takes the height of the tallest, so nothing is ever cut.
    -->
    <div class="relative grid overflow-hidden rounded-xl">
      <div
        v-for="(slide, i) in slides"
        :key="i"
        class="relative col-start-1 row-start-1"
        :class="[
          isSingle ? '' : 'transition-opacity duration-700',
          !isSingle && i !== current ? 'opacity-0 pointer-events-none' : 'opacity-100',
        ]"
      >
        <component
          :is="slide.url ? 'a' : 'div'"
          :href="slide.url"
          :target="isExternal(slide.url) ? '_blank' : undefined"
          :rel="isExternal(slide.url) ? 'noopener noreferrer' : undefined"
          class="block"
        >
          <img :src="slide.image" class="w-full h-auto" :alt="slide.title ?? ''" />
          <div v-if="slide.title || slide.text" class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-6 text-white">
            <h3 class="text-xl font-bold">{{ slide.title }}</h3>
            <p class="text-sm opacity-90">{{ slide.text }}</p>
          </div>
        </component>
      </div>
    </div>
    <template v-if="!isSingle">
      <button class="slider-nav left-3" aria-label="Previous" @click="go(current - 1)">‹</button>
      <button class="slider-nav right-3" aria-label="Next" @click="go(current + 1)">›</button>
      <div class="flex justify-center gap-2 mt-3">
        <button
          v-for="(_, i) in slides"
          :key="i"
          class="w-2.5 h-2.5 rounded-full"
          :style="{ background: i === current ? DOT_ACTIVE : DOT_IDLE }"
          :aria-label="`Slide ${i + 1}`"
          @click="go(i)"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.slider-nav {
  @apply absolute top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full w-10 h-10 text-2xl leading-none shadow;
}
.left-3 { left: 0.75rem; }
.right-3 { right: 0.75rem; }
</style>
