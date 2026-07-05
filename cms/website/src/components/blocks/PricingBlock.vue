<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    plans?: Array<{ name: string; price: string; features?: string; url?: string; highlighted?: boolean }>;
  }>(),
  { plans: () => [] },
);
</script>

<template>
  <div class="py-12">
    <h2 v-if="title" class="text-3xl font-bold text-center mb-10">{{ title }}</h2>
    <div class="grid gap-6 md:grid-cols-3 max-w-4xl mx-auto">
      <div
        v-for="(plan, i) in plans"
        :key="i"
        class="rounded-2xl border p-6 flex flex-col"
        :class="plan.highlighted ? 'border-2 shadow-lg scale-105 bg-white' : 'border-gray-200 bg-white'"
        :style="plan.highlighted ? { borderColor: 'var(--color-primary)' } : {}"
      >
        <h3 class="font-semibold text-lg">{{ plan.name }}</h3>
        <div class="text-3xl font-extrabold my-3">{{ plan.price }}</div>
        <ul class="text-sm text-gray-600 space-y-2 flex-1">
          <li v-for="(feat, j) in (plan.features ?? '').split('\n').filter(Boolean)" :key="j">✓ {{ feat }}</li>
        </ul>
        <a v-if="plan.url" :href="plan.url" class="btn-primary mt-6 text-center">Choose</a>
      </div>
    </div>
  </div>
</template>
