<script setup lang="ts">
defineProps<{
  headline?: string;
  subheadline?: string;
  image?: string;
  ctaLabel?: string;
  ctaUrl?: string;
}>();
</script>

<template>
  <div
    class="relative py-24 md:py-32 text-center rounded-none"
    :style="image ? { backgroundImage: `url(${image})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
  >
    <div v-if="image" class="absolute inset-0 bg-black/50" />
    <div class="relative">
      <h1 class="text-4xl md:text-5xl font-extrabold mb-4">{{ headline }}</h1>
      <p v-if="subheadline" class="text-lg md:text-xl opacity-90 max-w-2xl mx-auto mb-8">{{ subheadline }}</p>
      <RouterLink v-if="ctaLabel && ctaUrl && !ctaUrl.startsWith('http')" :to="ctaUrl" class="btn-primary">{{ ctaLabel }}</RouterLink>
      <a v-else-if="ctaLabel && ctaUrl" :href="ctaUrl" class="btn-primary">{{ ctaLabel }}</a>
    </div>
  </div>
</template>
