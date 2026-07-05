<script setup lang="ts">
import FormRenderer from '@/components/FormRenderer.vue';

withDefaults(defineProps<{ formSlug?: string; title?: string }>(), { formSlug: 'contact' });
</script>

<template>
  <div class="py-12 max-w-2xl mx-auto">
    <h2 v-if="title" class="text-3xl font-bold text-center mb-8">{{ title }}</h2>
    <FormRenderer :slug="formSlug" />
  </div>
</template>
