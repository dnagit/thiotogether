<script setup lang="ts">
import { computed } from 'vue';
import { sanitizeHtml } from '@/utils/sanitize';

const props = defineProps<{ html?: string }>();
const safeHtml = computed(() => sanitizeHtml(props.html ?? ''));
</script>

<template>
  <!-- Admin-authored content, sanitized client-side as defense in depth. -->
  <div class="prose-cms py-10" v-html="safeHtml" />
</template>
