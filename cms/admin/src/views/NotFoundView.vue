<script setup lang="ts">
import { useRouter } from 'vue-router';
const router = useRouter();
</script>

<template>
  <ElResult icon="warning" title="404" sub-title="This page does not exist.">
    <template #extra>
      <ElButton type="primary" @click="router.push('/')">Back to Dashboard</ElButton>
    </template>
  </ElResult>
</template>
