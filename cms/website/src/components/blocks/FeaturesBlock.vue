<script setup lang="ts">
withDefaults(
  defineProps<{ title?: string; items?: Array<{ icon?: string; title: string; text?: string }> }>(),
  { items: () => [] },
);
</script>

<template>
  <div class="py-12">
    <h2 v-if="title" class="text-3xl font-bold text-center mb-10">{{ title }}</h2>
    <div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="(item, i) in items" :key="i" class="text-center">
        <div class="text-4xl mb-3">{{ item.icon }}</div>
        <h3 class="font-semibold text-lg mb-1">{{ item.title }}</h3>
        <p class="text-sm text-gray-600">{{ item.text }}</p>
      </div>
    </div>
  </div>
</template>
