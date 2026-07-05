<script setup lang="ts">
withDefaults(
  defineProps<{ title?: string; items?: Array<{ date: string; title: string; text?: string }> }>(),
  { items: () => [] },
);
</script>

<template>
  <div class="py-12 max-w-2xl mx-auto">
    <h2 v-if="title" class="text-3xl font-bold text-center mb-10">{{ title }}</h2>
    <ol class="relative border-l-2 pl-6 space-y-8" :style="{ borderColor: 'var(--color-primary)' }">
      <li v-for="(item, i) in items" :key="i" class="relative">
        <span
          class="absolute -left-[31px] w-4 h-4 rounded-full border-2 border-white"
          :style="{ background: 'var(--color-primary)' }"
        />
        <div class="text-xs uppercase tracking-wide text-gray-500">{{ item.date }}</div>
        <h3 class="font-semibold text-lg">{{ item.title }}</h3>
        <p class="text-sm text-gray-600">{{ item.text }}</p>
      </li>
    </ol>
  </div>
</template>
