<script setup lang="ts">
import { ref } from 'vue';

withDefaults(defineProps<{ title?: string; items?: Array<{ question: string; answer: string }> }>(), {
  items: () => [],
});

const open = ref<number | null>(null);
</script>

<template>
  <div class="py-12 max-w-3xl mx-auto">
    <h2 v-if="title" class="text-3xl font-bold text-center mb-8">{{ title }}</h2>
    <div class="divide-y divide-gray-200 border border-gray-200 rounded-xl overflow-hidden">
      <div v-for="(item, i) in items" :key="i">
        <button
          class="w-full flex justify-between items-center px-5 py-4 text-left font-medium hover:bg-gray-50"
          @click="open = open === i ? null : i"
        >
          {{ item.question }}
          <span class="text-xl leading-none">{{ open === i ? '−' : '+' }}</span>
        </button>
        <div v-if="open === i" class="px-5 pb-4 text-gray-600 whitespace-pre-line">{{ item.answer }}</div>
      </div>
    </div>
  </div>
</template>
