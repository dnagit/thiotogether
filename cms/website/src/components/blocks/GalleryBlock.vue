<script setup lang="ts">
import { ref } from 'vue';

withDefaults(defineProps<{ images?: Array<{ src: string; alt?: string }>; columns?: number }>(), {
  images: () => [],
  columns: 3,
});

const lightbox = ref<string | null>(null);
</script>

<template>
  <div class="py-10">
    <div class="grid gap-4" :style="{ gridTemplateColumns: `repeat(${Math.min(columns, 6)}, minmax(0, 1fr))` }">
      <img
        v-for="(img, i) in images"
        :key="i"
        :src="img.src"
        :alt="img.alt ?? ''"
        loading="lazy"
        class="w-full h-48 object-cover rounded-lg cursor-zoom-in hover:opacity-90 transition"
        @click="lightbox = img.src"
      />
    </div>
    <div v-if="lightbox" class="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" @click="lightbox = null">
      <img :src="lightbox" class="max-h-full max-w-full rounded-lg" />
    </div>
  </div>
</template>
