<script setup lang="ts">
/**
 * Colour choice: the party palette, plus a native colour input for anyone who wants a
 * shade that is not on it. The custom swatch is part of the same radio group, so picking
 * a preset and picking a custom colour cannot both look selected at once.
 */
import { computed } from 'vue';
import { BALLOON_COLORS, outlineColor } from './balloon';

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [string] }>();

const groupName = `balloon-color-${Math.random().toString(36).slice(2, 8)}`;

const isPreset = computed(() =>
  BALLOON_COLORS.some((c) => c.hex.toLowerCase() === props.modelValue.toLowerCase()),
);
/** What the custom well shows: the current colour when it is custom, a neutral otherwise. */
const customValue = computed(() => (isPreset.value ? '#ffffff' : props.modelValue));
</script>

<template>
  <fieldset>
    <legend class="mb-2 font-semibold text-gray-800">สีลูกโป่ง</legend>
    <div class="swatches">
      <label v-for="color in BALLOON_COLORS" :key="color.hex" class="dot-wrap" :title="color.label">
        <input
          type="radio"
          class="sr-only"
          :name="groupName"
          :value="color.hex"
          :checked="modelValue.toLowerCase() === color.hex.toLowerCase()"
          @change="emit('update:modelValue', color.hex)"
        />
        <span
          class="dot"
          :style="{ background: color.hex, borderColor: outlineColor(color.hex) }"
          aria-hidden="true"
        />
        <span class="sr-only">{{ color.label }}</span>
      </label>

      <!--
        A colour input cannot be a radio, so the label carries the "custom" state and the
        input inside it both reports and sets the value.
      -->
      <label class="dot-wrap" :class="{ 'is-custom-on': !isPreset }" title="เลือกสีเอง">
        <input
          type="color"
          class="custom-input"
          :value="customValue"
          @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        />
        <span class="dot dot-custom" aria-hidden="true">
          <span v-if="!isPreset" class="dot-fill" :style="{ background: modelValue }" />
        </span>
        <span class="sr-only">เลือกสีเอง</span>
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}
.dot-wrap {
  position: relative;
  cursor: pointer;
  line-height: 0;
}
.dot {
  display: block;
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 2px solid transparent;
  box-shadow: 0 1px 3px rgb(0 0 0 / 20%);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.dot-wrap:hover .dot {
  transform: scale(1.08);
}
/* A dark ring with a white gap — visible over a swatch of any colour, including a dark one. */
.dot-wrap input:checked + .dot,
.is-custom-on .dot {
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px #111827;
}
.dot-wrap input:focus-visible + .dot {
  outline: 3px solid #1d4ed8;
  outline-offset: 3px;
}

/* The rainbow well reads as "anything else"; the chosen colour covers it once picked. */
.dot-custom {
  position: relative;
  overflow: hidden;
  background: conic-gradient(#ef4444, #f59e0b, #22c55e, #06b6d4, #6366f1, #ec4899, #ef4444);
}
.dot-fill {
  position: absolute;
  inset: 0;
}

/* Kept on top of the swatch and invisible: clicking anywhere on the dot opens the OS picker. */
.custom-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  border: 0;
  padding: 0;
}
.custom-input:focus-visible + .dot {
  outline: 3px solid #1d4ed8;
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  .dot {
    transition: none;
  }
  .dot-wrap:hover .dot {
    transform: none;
  }
}
</style>
