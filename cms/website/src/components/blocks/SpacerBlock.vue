<script setup lang="ts">
withDefaults(defineProps<{ height?: string }>(), { height: '4rem' });
</script>

<template>
  <div :style="{ height }" aria-hidden="true" />
</template>
