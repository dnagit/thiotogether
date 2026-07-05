<script setup lang="ts">
import { applySeo } from '@/composables/useSeo';
applySeo({ title: 'Something went wrong', noIndex: true });
</script>

<template>
  <div class="py-32 text-center">
    <div class="text-7xl font-extrabold mb-4 text-red-500">500</div>
    <h1 class="text-2xl font-bold mb-2">Something went wrong</h1>
    <p class="text-gray-500 mb-8">We're working on it — please try again shortly.</p>
    <button class="btn-primary" @click="$router.go(0)">Reload</button>
  </div>
</template>
