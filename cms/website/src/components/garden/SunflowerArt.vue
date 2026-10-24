<script setup lang="ts">
/**
 * One plant, as the field, the cards and "my garden" all draw it.
 *
 * Three things it can be, in order of preference:
 *  - a **flower** — the admin's picture, with a face drawn into it when there is one. The face
 *    sits where the admin put it: centre and diameter as percentages of the picture's width,
 *    so the picture is a size container and `top` is in `cqw`, the same unit as the rest.
 *  - a **growth stage** the admin uploaded.
 *  - the **built-in drawing** of that stage, for a garden whose stages are not uploaded yet.
 *
 * Pictures are bottom-anchored: whatever its height, a plant stands on its own foot.
 */
import { computed } from 'vue';
import type { Flower } from '@/api/garden';
import BuiltinPlant from './BuiltinPlant.vue';

const props = withDefaults(
  defineProps<{
    flower?: Flower | null;
    face?: { imageUrl: string } | null;
    stageImage?: string | null;
    /** 0 seed · 1 sprout · 2 stem · 3 bud — used only when there is no picture at all. */
    builtin?: number;
    /** Lazy-load the picture; the field has hundreds of these. */
    lazy?: boolean;
    alt?: string;
  }>(),
  { flower: null, face: null, stageImage: null, builtin: 0, lazy: false, alt: '' },
);

const hasFace = computed(
  () =>
    !!props.flower && !!props.face && props.flower.faceX !== null && props.flower.faceY !== null,
);
</script>

<template>
  <div class="sf">
    <div v-if="flower" class="sf-pic">
      <img
        :src="flower.imageUrl"
        :alt="alt || flower.name"
        :loading="lazy ? 'lazy' : 'eager'"
        draggable="false"
      />
      <span
        v-if="hasFace"
        class="sf-face"
        :style="{
          left: `${flower.faceX}%`,
          top: `${flower.faceY}cqw`,
          width: `${flower.faceSize ?? 30}%`,
        }"
      >
        <img :src="face!.imageUrl" alt="" draggable="false" />
      </span>
    </div>

    <img
      v-else-if="stageImage"
      class="sf-stage"
      :src="stageImage"
      :alt="alt"
      :loading="lazy ? 'lazy' : 'eager'"
      draggable="false"
    />

    <svg
      v-else
      class="sf-stage"
      viewBox="0 0 100 150"
      role="img"
      :aria-label="alt || 'ต้นทานตะวัน'"
    >
      <BuiltinPlant :stage="builtin" />
    </svg>
  </div>
</template>

<style scoped>
.sf {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
  height: 100%;
}
.sf-pic {
  position: relative;
  width: 100%;
  container-type: inline-size;
}
.sf-pic > img,
.sf-stage {
  display: block;
  width: 100%;
  height: auto;
  user-select: none;
  -webkit-user-drag: none;
}
.sf-face {
  position: absolute;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  overflow: hidden;
}
.sf-face img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
