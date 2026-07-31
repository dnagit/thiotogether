<script setup lang="ts">
defineProps<{ title?: string; subtitle?: string; image?: string }>();
</script>

<template>
  <div class="relative py-16 text-center">
    <!--
      An element rather than a background: the artwork is a cutout that belongs in the bottom-right
      corner, and its height is a percentage of the banner so it scales with the block on every screen.
    -->
    <img
      v-if="image"
      :src="image"
      alt=""
      aria-hidden="true"
      class="pointer-events-none select-none absolute right-0 bottom-0 h-full w-auto
             max-w-[clamp(40%,50vw,55%)] object-contain object-right-bottom"
    />
    <div class="relative">
      <h1 class="text-3xl md:text-4xl font-bold">{{ title }}</h1>
      <p v-if="subtitle" class="mt-2 text-lg opacity-80">{{ subtitle }}</p>
    </div>
  </div>
</template>
