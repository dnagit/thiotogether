<script setup lang="ts">
defineProps<{ title?: string; text?: string; buttonLabel?: string; buttonUrl?: string }>();
</script>

<template>
  <div class="py-16 text-center rounded-2xl my-8 text-white" :style="{ background: 'var(--color-primary)' }">
    <h2 class="text-3xl font-bold mb-2">{{ title }}</h2>
    <p v-if="text" class="opacity-90 mb-6 max-w-xl mx-auto">{{ text }}</p>
    <RouterLink
      v-if="buttonLabel && buttonUrl && !buttonUrl.startsWith('http')"
      :to="buttonUrl"
      class="inline-block bg-white font-semibold px-8 py-3 rounded-lg hover:opacity-90 transition"
      :style="{ color: 'var(--color-primary)' }"
    >{{ buttonLabel }}</RouterLink>
    <a
      v-else-if="buttonLabel && buttonUrl"
      :href="buttonUrl"
      class="inline-block bg-white font-semibold px-8 py-3 rounded-lg hover:opacity-90 transition"
      :style="{ color: 'var(--color-primary)' }"
    >{{ buttonLabel }}</a>
  </div>
</template>
