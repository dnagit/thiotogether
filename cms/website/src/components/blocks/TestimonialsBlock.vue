<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    items?: Array<{ quote: string; author?: string; role?: string; avatar?: string }>;
  }>(),
  { items: () => [] },
);
</script>

<template>
  <div class="py-12">
    <h2 v-if="title" class="text-3xl font-bold text-center mb-10">{{ title }}</h2>
    <div class="grid gap-6 md:grid-cols-3">
      <blockquote v-for="(t, i) in items" :key="i" class="bg-gray-50 rounded-xl p-6">
        <p class="italic text-gray-700 mb-4">“{{ t.quote }}”</p>
        <footer class="flex items-center gap-3">
          <img v-if="t.avatar" :src="t.avatar" class="w-10 h-10 rounded-full object-cover" :alt="t.author ?? ''" />
          <div>
            <div class="font-semibold text-sm">{{ t.author }}</div>
            <div class="text-xs text-gray-500">{{ t.role }}</div>
          </div>
        </footer>
      </blockquote>
    </div>
  </div>
</template>
