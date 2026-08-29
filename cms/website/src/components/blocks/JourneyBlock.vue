<script setup lang="ts">
/**
 * A heading, a stretch of writing, and a row of pictures that moves on its own — a story
 * with its own photographs under it.
 *
 * The slider and its lightbox are {@link GallerySlider}, shared with the project detail page.
 */
import { computed } from 'vue';
import GallerySlider from '@/components/GallerySlider.vue';
import type { SlideImage } from '@/components/gallery';

const props = withDefaults(
  defineProps<{
    heading?: string;
    /** The writing above the pictures. Line breaks are kept as typed. */
    body?: string;
    images?: SlideImage[];
    /** Pictures across on a desktop. Phones get one, tablets two. */
    perView?: number | string;
    ratio?: string;
    autoplay?: boolean;
    /** Seconds between moves. */
    interval?: number | string;
    headingColor?: string;
    textColor?: string;
    background?: string;
  }>(),
  {
    heading: '',
    body: '',
    images: () => [],
    perView: 3,
    ratio: '4 / 3',
    autoplay: true,
    interval: 4,
    headingColor: '',
    textColor: '',
    background: '',
  },
);

const shell = computed(() => ({
  '--heading': props.headingColor || 'inherit',
  '--ink': props.textColor || 'inherit',
  ...(props.background ? { background: props.background } : {}),
}));
</script>

<template>
  <section class="wrap" :style="shell">
    <div class="container-site inner">
      <h2 v-if="heading" class="heading">{{ heading }}</h2>

      <!--
        `pre-line` keeps the breaks and blank lines the editor typed, which is what turns a
        run of years into paragraphs without anyone having to write HTML.
      -->
      <p v-if="body" class="body">{{ body }}</p>

      <GallerySlider
        v-if="images.length"
        class="gallery"
        :images="images"
        :per-view="perView"
        :ratio="ratio"
        :autoplay="autoplay"
        :interval="interval"
        :label="heading"
      />
    </div>
  </section>
</template>

<style scoped>
.wrap {
  padding: clamp(1.5rem, 4vw, 3.5rem) 0;
  color: var(--ink);
}
.inner {
  padding-inline: 1rem;
}

.heading {
  margin: 0 0 clamp(1.25rem, 3vw, 2.25rem);
  text-align: center;
  font-weight: 800;
  line-height: 1.25;
  font-size: clamp(1.35rem, 3vw, 2.25rem);
  color: var(--heading);
  text-wrap: balance;
}

.body {
  max-width: 52rem;
  margin: 0 auto clamp(1.5rem, 4vw, 2.5rem);
  white-space: pre-line;
  line-height: 1.85;
  font-size: clamp(0.9rem, 1.15vw, 1.05rem);
}

.gallery {
  max-width: 68rem;
  margin: 0 auto;
}
</style>
