<script setup lang="ts">
/**
 * Shape choice, drawn rather than named — "หัวใจ" and "ดาว" are quicker to recognise as
 * silhouettes. Each swatch is painted in the colour already chosen, so the two pickers
 * answer each other instead of being read separately.
 *
 * Native radios under the swatches: arrow keys move through the group and the browser
 * announces "2 of 5" without any of it being reimplemented here.
 */
import { BALLOON_SHAPES, DEFAULT_COLOR, outlineColor, type BalloonShapeId } from './balloon';

defineProps<{ modelValue: BalloonShapeId; color?: string | null }>();
defineEmits<{ 'update:modelValue': [BalloonShapeId] }>();

const groupName = `balloon-shape-${Math.random().toString(36).slice(2, 8)}`;
</script>

<template>
  <fieldset>
    <legend class="mb-2 font-semibold text-gray-800">รูปร่างลูกโป่ง</legend>
    <div class="swatches">
      <label v-for="shape in BALLOON_SHAPES" :key="shape.id" class="swatch">
        <input
          type="radio"
          class="sr-only"
          :name="groupName"
          :value="shape.id"
          :checked="modelValue === shape.id"
          @change="$emit('update:modelValue', shape.id)"
        />
        <span class="swatch-box">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <path
              :d="shape.path"
              :fill="color || DEFAULT_COLOR"
              :stroke="outlineColor(color || DEFAULT_COLOR)"
              stroke-width="2"
            />
          </svg>
        </span>
        <span class="swatch-label">{{ shape.label }}</span>
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.swatch {
  cursor: pointer;
  text-align: center;
  flex: 0 0 auto;
}
.swatch-box {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  padding: 8px;
  border: 2px solid #e5e7eb;
  border-radius: 14px;
  background: #fff;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.swatch-box svg {
  width: 100%;
  height: 100%;
}
.swatch:hover .swatch-box {
  border-color: #d1d5db;
}
/* The ring is not the only cue — the label goes bold too, so the choice survives a
   colour-blind read and a greyscale print. */
.swatch input:checked + .swatch-box {
  border-color: #111827;
  transform: translateY(-2px);
}
.swatch input:focus-visible + .swatch-box {
  outline: 3px solid #1d4ed8;
  outline-offset: 2px;
}
.swatch-label {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.8rem;
  color: #4b5563;
}
.swatch input:checked ~ .swatch-label {
  font-weight: 700;
  color: #111827;
}

@media (prefers-reduced-motion: reduce) {
  .swatch-box {
    transition: none;
  }
  .swatch input:checked + .swatch-box {
    transform: none;
  }
}
</style>
