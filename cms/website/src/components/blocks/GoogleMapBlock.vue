<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{ lat?: number; lng?: number; zoom?: number }>(), {
  lat: 13.7563,
  lng: 100.5018,
  zoom: 14,
});

// Keyless embed — no API key required for a basic map.
const src = computed(
  () => `https://maps.google.com/maps?q=${props.lat},${props.lng}&z=${props.zoom}&output=embed`,
);
</script>

<template>
  <div class="py-10">
    <iframe
      :src="src"
      class="w-full h-96 rounded-xl border-0"
      loading="lazy"
      referrerpolicy="no-referrer-when-downgrade"
      title="Map"
    />
  </div>
</template>
