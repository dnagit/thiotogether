<script setup lang="ts">
defineProps<{ title?: string; subtitle?: string; image?: string }>();
</script>

<template>
  <div
    class="relative py-16 text-center"
    :style="image ? { backgroundImage: `url(${image})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
  >
    <div v-if="image" class="absolute inset-0 bg-black/40" />
    <div class="relative" :class="image ? 'text-white' : ''">
      <h1 class="text-3xl md:text-4xl font-bold">{{ title }}</h1>
      <p v-if="subtitle" class="mt-2 text-lg opacity-80">{{ subtitle }}</p>
    </div>
  </div>
</template>
