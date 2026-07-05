<script setup lang="ts">
withDefaults(defineProps<{ text?: string; align?: 'left' | 'center' | 'right' }>(), {
  text: '',
  align: 'left',
});
</script>

<template>
  <p class="py-8 leading-relaxed whitespace-pre-line" :style="{ textAlign: align }">{{ text }}</p>
</template>
