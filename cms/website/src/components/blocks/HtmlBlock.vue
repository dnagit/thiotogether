<script setup lang="ts">
import { computed } from 'vue';
import { sanitizeHtml } from '@/utils/sanitize';

const props = defineProps<{ html?: string }>();
const safeHtml = computed(() => sanitizeHtml(props.html ?? ''));
</script>

<template>
  <div class="py-6" v-html="safeHtml" />
</template>
