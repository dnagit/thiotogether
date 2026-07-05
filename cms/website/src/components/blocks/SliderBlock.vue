<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    slides?: Array<{ image: string; title?: string; text?: string; url?: string }>;
    autoplay?: boolean;
    interval?: number;
  }>(),
  { slides: () => [], autoplay: true, interval: 5000 },
);

const current = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;

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
    <div class="relative overflow-hidden rounded-xl h-72 md:h-96">
      <div
        v-for="(slide, i) in slides"
        :key="i"
        class="absolute inset-0 transition-opacity duration-700"
        :class="i === current ? 'opacity-100' : 'opacity-0 pointer-events-none'"
      >
        <img :src="slide.image" class="w-full h-full object-cover" :alt="slide.title ?? ''" />
        <div v-if="slide.title || slide.text" class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-6 text-white">
          <h3 class="text-xl font-bold">{{ slide.title }}</h3>
          <p class="text-sm opacity-90">{{ slide.text }}</p>
        </div>
      </div>
    </div>
    <button class="slider-nav left-3" aria-label="Previous" @click="go(current - 1)">‹</button>
    <button class="slider-nav right-3" aria-label="Next" @click="go(current + 1)">›</button>
    <div class="flex justify-center gap-2 mt-3">
      <button
        v-for="(_, i) in slides"
        :key="i"
        class="w-2.5 h-2.5 rounded-full"
        :style="{ background: i === current ? 'var(--color-primary)' : '#d1d5db' }"
        :aria-label="`Slide ${i + 1}`"
        @click="go(i)"
      />
    </div>
  </div>
</template>

<style scoped>
.slider-nav {
  @apply absolute top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full w-10 h-10 text-2xl leading-none shadow;
}
.left-3 { left: 0.75rem; }
.right-3 { right: 0.75rem; }
</style>
