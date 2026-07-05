<script setup lang="ts">
import { applySeo } from '@/composables/useSeo';
applySeo({ title: 'Page not found', noIndex: true });
</script>

<template>
  <div class="py-32 text-center">
    <div class="text-7xl font-extrabold mb-4" :style="{ color: 'var(--color-primary)' }">404</div>
    <h1 class="text-2xl font-bold mb-2">Page not found</h1>
    <p class="text-gray-500 mb-8">The page you are looking for doesn't exist or has been moved.</p>
    <RouterLink to="/" class="btn-primary">Back to Home</RouterLink>
  </div>
</template>
