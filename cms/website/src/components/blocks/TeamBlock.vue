<script setup lang="ts">
withDefaults(
  defineProps<{ title?: string; members?: Array<{ photo?: string; name: string; role?: string }> }>(),
  { members: () => [] },
);
</script>

<template>
  <div class="py-12">
    <h2 v-if="title" class="text-3xl font-bold text-center mb-10">{{ title }}</h2>
    <div class="grid gap-8 grid-cols-2 md:grid-cols-4 max-w-4xl mx-auto">
      <div v-for="(m, i) in members" :key="i" class="text-center">
        <img
          v-if="m.photo"
          :src="m.photo"
          :alt="m.name"
          loading="lazy"
          class="w-28 h-28 rounded-full object-cover mx-auto mb-3"
        />
        <div v-else class="w-28 h-28 rounded-full bg-gray-200 mx-auto mb-3 flex items-center justify-center text-3xl">👤</div>
        <div class="font-semibold">{{ m.name }}</div>
        <div class="text-sm text-gray-500">{{ m.role }}</div>
      </div>
    </div>
  </div>
</template>
