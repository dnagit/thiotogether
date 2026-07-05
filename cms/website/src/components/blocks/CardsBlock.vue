<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    items?: Array<{ image?: string; title: string; text?: string; url?: string }>;
    columns?: number;
  }>(),
  { items: () => [], columns: 3 },
);
</script>

<template>
  <div class="py-12">
    <h2 v-if="title" class="text-3xl font-bold text-center mb-8">{{ title }}</h2>
    <div class="grid gap-6 sm:grid-cols-2" :style="{ '--cols': Math.min(columns, 4) }" :class="`lg:grid-cols-${Math.min(columns, 4)}`">
      <component
        :is="item.url && !item.url.startsWith('http') ? 'RouterLink' : item.url ? 'a' : 'div'"
        v-for="(item, i) in items"
        :key="i"
        :to="item.url && !item.url.startsWith('http') ? item.url : undefined"
        :href="item.url?.startsWith('http') ? item.url : undefined"
        class="block bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition overflow-hidden"
      >
        <img v-if="item.image" :src="item.image" :alt="item.title" loading="lazy" class="w-full h-44 object-cover" />
        <div class="p-5">
          <h3 class="font-semibold text-lg mb-1">{{ item.title }}</h3>
          <p class="text-sm text-gray-600">{{ item.text }}</p>
        </div>
      </component>
    </div>
  </div>
</template>
