<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ url?: string; title?: string }>();

/** Convert YouTube/Vimeo URLs into embeddable ones; otherwise use <video>. */
const embedUrl = computed(() => {
  const url = props.url ?? '';
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/.exec(url);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vimeo = /vimeo\.com\/(\d+)/.exec(url);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
});
</script>

<template>
  <div class="py-10">
    <h3 v-if="title" class="text-2xl font-bold mb-4 text-center">{{ title }}</h3>
    <div class="aspect-video max-w-3xl mx-auto rounded-xl overflow-hidden bg-black">
      <iframe
        v-if="embedUrl"
        :src="embedUrl"
        class="w-full h-full"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
        :title="title ?? 'Video'"
      />
      <video v-else-if="url" :src="url" controls class="w-full h-full" />
    </div>
  </div>
</template>
