<script setup lang="ts">
withDefaults(defineProps<{ src?: string; alt?: string; caption?: string; rounded?: boolean }>(), {
  rounded: true,
});
</script>

<template>
  <figure class="py-8 text-center">
    <img :src="src" :alt="alt ?? ''" loading="lazy" class="mx-auto max-w-full" :class="rounded ? 'rounded-xl' : ''" />
    <figcaption v-if="caption" class="mt-2 text-sm text-gray-500">{{ caption }}</figcaption>
  </figure>
</template>
