<script setup lang="ts">
/**
 * The field: every visible plant standing in its plot, with the decorations the donations
 * have unlocked placed across the top of it.
 *
 * Positions come from `plotSpot`, which depends only on a plant's plot number, so the field
 * never rearranges as it grows. Everything is laid out in field widths — the field is a size
 * container and vertical positions are `cqw` — so a phone and a monitor show the same field,
 * only fewer plants to a row on the phone.
 *
 * Decorations sit in the opening scene, the top 16:10 of the field: `posX`/`posY` are the
 * middle of their foot as percentages of that scene.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { useElementSize } from '@vueuse/core';
import type { Garden, Plant } from '@/api/garden';
import SunflowerArt from './SunflowerArt.vue';
import { builtinStage, fieldRows, plotSpot, stageFor } from './garden';

const props = defineProps<{
  garden: Garden;
  plants: Plant[];
  now: number;
  highlightId?: number | null;
}>();
const emit = defineEmits<{ select: [plant: Plant] }>();

const root = ref<HTMLElement | null>(null);
const { width } = useElementSize(root);

const perRow = computed(() => (width.value < 480 ? 6 : width.value < 800 ? 9 : 12));
/** Where the first row stands, in field widths: below the sky. */
const TOP = 0.2;
const SCENE = 0.625;

const lastPlot = computed(() => props.plants.reduce((max, p) => Math.max(max, p.plotIndex), 0));
const rowHeight = computed(() => (1 / perRow.value) * 0.9);
const height = computed(() =>
  Math.max(SCENE, TOP + (fieldRows(lastPlot.value, perRow.value) + 1.2) * rowHeight.value),
);

/** Same stage for the whole field except seeds sown today, so it is worked out once. */
const stage = computed(() =>
  stageFor(props.garden.growthStages, props.garden.revealAt, null, props.now),
);
const builtin = computed(() => builtinStage(props.garden.revealAt, null, props.now));

function art(plant: Plant) {
  const fresh = props.now - new Date(plant.plantedAt).getTime() < 86_400_000;
  return {
    stageImage: fresh
      ? (stageFor(props.garden.growthStages, props.garden.revealAt, plant.plantedAt, props.now)
          ?.imageUrl ?? null)
      : (stage.value?.imageUrl ?? null),
    builtin: fresh ? 0 : builtin.value,
  };
}

const spots = computed(() =>
  props.plants.map((plant) => ({
    plant,
    spot: plotSpot(plant.plotIndex, perRow.value, TOP),
    art: art(plant),
  })),
);

function decorationZ(posY: number): number {
  const foot = (posY / 100) * SCENE;
  return Math.max(0, Math.floor((foot - TOP) / rowHeight.value) * 2 + 2);
}

/** Bring a plant into view — "go to my plant". */
async function reveal(id: number): Promise<void> {
  await nextTick();
  root.value
    ?.querySelector(`[data-plant="${id}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
watch(
  () => [props.highlightId, props.plants.length] as const,
  ([id]) => id && void reveal(id),
  { immediate: true },
);
</script>

<template>
  <!-- The wrapper is the size container; the field's own height is in its `cqw`. -->
  <div ref="root" class="field-wrap">
    <div
      class="field"
      :class="{ 'field-bloom': garden.revealed }"
      :style="{
        height: `${height * 100}cqw`,
        backgroundImage: garden.fieldImage ? `url(${garden.fieldImage})` : undefined,
      }"
    >
      <img
        v-for="d in garden.decorations"
        :key="`d${d.id}`"
        :src="d.imageUrl"
        :alt="d.name"
        :title="d.name"
        class="decor"
        :style="{
          left: `${d.posX}%`,
          top: `${(d.posY / 100) * SCENE * 100}cqw`,
          width: `${d.size}%`,
          zIndex: decorationZ(d.posY),
        }"
        draggable="false"
      />

      <button
        v-for="{ plant, spot, art: a } in spots"
        :key="plant.id"
        type="button"
        class="plot"
        :class="{ 'plot-on': plant.id === highlightId }"
        :data-plant="plant.id"
        :title="`ต้นที่ ${plant.plotIndex} · ${plant.name}`"
        :aria-label="`ต้นที่ ${plant.plotIndex} ของ ${plant.name}`"
        :style="{
          left: `${spot.x}%`,
          top: `${spot.y * 100}cqw`,
          width: `${spot.width}%`,
          zIndex: spot.z,
          animationDelay: `${(plant.plotIndex % 24) * 60}ms`,
        }"
        @click="emit('select', plant)"
      >
        <SunflowerArt
          :flower="garden.revealed ? plant.flower : null"
          :face="plant.face"
          :stage-image="a.stageImage"
          :builtin="a.builtin"
          :alt="plant.name"
          lazy
        />
        <span v-if="plant.id === highlightId" class="plot-pin">ต้นที่ {{ plant.plotIndex }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.field-wrap {
  width: 100%;
  container-type: inline-size;
}
.field {
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: 20px;
  background-color: #9a6b3f;
  background-size: 100% auto;
  background-repeat: repeat-y;
  background-image:
    linear-gradient(#7dd3fc 0, #bae6fd 9cqw, #86efac 9cqw, #4ade80 13cqw, transparent 13cqw),
    repeating-linear-gradient(#a47148 0 3cqw, #8b5e34 3cqw 6cqw);
  box-shadow: inset 0 0 0 4px rgb(255 255 255 / 0.35);
}
.decor {
  position: absolute;
  transform: translate(-50%, -100%);
  pointer-events: none;
  user-select: none;
}
.plot {
  position: absolute;
  transform: translate(-50%, -100%);
  padding: 0;
  background: none;
  border: 0;
  cursor: pointer;
  transform-origin: 50% 100%;
}
.plot:hover {
  filter: brightness(1.08) drop-shadow(0 0 6px rgb(255 255 255 / 0.9));
}
.plot-on {
  filter: drop-shadow(0 0 10px #fde047) drop-shadow(0 0 4px #f59e0b);
}
.plot-pin {
  position: absolute;
  left: 50%;
  bottom: 100%;
  transform: translateX(-50%);
  padding: 2px 8px;
  border-radius: 999px;
  background: #f59e0b;
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}
.field-bloom .plot {
  animation: bloom 0.9s cubic-bezier(0.2, 1.4, 0.4, 1) both;
}
@keyframes bloom {
  from {
    transform: translate(-50%, -100%) scale(0.4);
    opacity: 0;
  }
  to {
    transform: translate(-50%, -100%) scale(1);
    opacity: 1;
  }
}
</style>
