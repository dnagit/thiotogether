<script setup lang="ts">
/**
 * A plant's card: the seed card from the moment it is sown, the reveal card once it blooms.
 *
 * One SVG, drawn on screen and saved from that same element (see `WishCardActions`), so the
 * picture kept is the card that was looked at. Every remote picture inside it is an `<image>`,
 * which the export inlines.
 *
 * The face is placed against the flower as it lands in its box — `xMidYMax meet`, bottom
 * centred — which needs the picture's aspect, measured the same way the balloons measure
 * their photos.
 */
import { computed, ref } from 'vue';
import type { Plant } from '@/api/garden';
import { useImageAspect } from '../birthday/useImageAspect';
import BuiltinPlant from './BuiltinPlant.vue';
import { RARITY_LABEL, thaiDate } from './garden';
import { GARDEN_CARD_HEIGHT, GARDEN_CARD_WIDTH, fitLine, fittedBox, wrapLines } from './gardenCard';
import { CARD_FONT } from '../birthday/wishCard';

const props = defineProps<{
  plant: Plant;
  gardenTitle: string;
  revealAt: string;
  revealed: boolean;
  /** The stage picture the field shows today, if the admin uploaded stages. */
  stageImage?: string | null;
  builtin?: number;
  themeColor?: string | null;
}>();

const svg = ref<SVGSVGElement | null>(null);
defineExpose({ svg: () => svg.value });

const W = GARDEN_CARD_WIDTH;
const H = GARDEN_CARD_HEIGHT;
const ART = { x: 160, y: 120, width: 400, height: 470 };

const theme = computed(() => props.themeColor || '#f59e0b');
/** The flower is shown once it has bloomed — or to its owner, who chose a secret one. */
const flower = computed(() => props.plant.flower);
const aspect = useImageAspect(() => flower.value?.imageUrl ?? props.stageImage ?? null);

const flowerBox = computed(() => (aspect.value ? fittedBox(aspect.value, ART) : null));
const face = computed(() => {
  const f = flower.value;
  const box = flowerBox.value;
  if (!f || !box || !props.plant.face || f.faceX === null || f.faceY === null) return null;
  return {
    cx: box.x + (f.faceX / 100) * box.width,
    cy: box.y + (f.faceY / 100) * box.width,
    r: ((f.faceSize ?? 30) / 200) * box.width,
    href: props.plant.face.imageUrl,
  };
});

const name = computed(() => fitLine(props.plant.name, 46, 24, 600));
const message = computed(() => wrapLines(props.plant.message ?? '', 30, 600, 5));
const mix = computed(() => props.plant.fertilizers ?? []);
const mixLabel = computed(() => mix.value.map((m) => `${m.name} ${m.pct}%`).join('  ·  '));

const footer = computed(() => {
  if (props.revealed && flower.value) {
    const rarity = RARITY_LABEL[flower.value.rarity] ?? '';
    return `${flower.value.name}${rarity ? ` · ${rarity}` : ''}`;
  }
  return `บานพร้อมกัน ${thaiDate(props.revealAt)}`;
});
const kind = computed(() => (props.revealed ? 'การ์ดทานตะวัน' : 'บัตรเมล็ดพันธุ์'));

const clipId = `face-${Math.random().toString(36).slice(2, 9)}`;
const gradId = `sky-${Math.random().toString(36).slice(2, 9)}`;
</script>

<template>
  <svg
    ref="svg"
    :viewBox="`0 0 ${W} ${H}`"
    class="garden-card"
    role="img"
    :aria-label="`${kind} ต้นที่ ${plant.plotIndex} ของ ${plant.name}`"
    :font-family="CARD_FONT"
  >
    <defs>
      <linearGradient :id="gradId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#e0f2fe" />
        <stop offset="0.55" stop-color="#fef9c3" />
        <stop offset="1" stop-color="#fde68a" />
      </linearGradient>
      <clipPath v-if="face" :id="clipId">
        <circle :cx="face.cx" :cy="face.cy" :r="face.r" />
      </clipPath>
    </defs>

    <rect x="0" y="0" :width="W" :height="H" rx="36" :fill="`url(#${gradId})`" />
    <rect
      x="14"
      y="14"
      :width="W - 28"
      :height="H - 28"
      rx="28"
      fill="none"
      :stroke="theme"
      stroke-width="6"
    />

    <text :x="W / 2" y="70" text-anchor="middle" font-size="26" font-weight="700" :fill="theme">
      {{ kind }}
    </text>
    <text :x="W / 2" y="102" text-anchor="middle" font-size="20" fill="#6b7280">
      {{ gardenTitle }}
    </text>

    <!-- Soil under the plant. -->
    <ellipse :cx="W / 2" :cy="ART.y + ART.height + 6" rx="190" ry="26" fill="#a47148" />
    <ellipse :cx="W / 2" :cy="ART.y + ART.height" rx="160" ry="16" fill="#8b5e34" />

    <template v-if="flower">
      <image
        :href="flower.imageUrl"
        :x="ART.x"
        :y="ART.y"
        :width="ART.width"
        :height="ART.height"
        preserveAspectRatio="xMidYMax meet"
      />
      <image
        v-if="face"
        :href="face.href"
        :x="face.cx - face.r"
        :y="face.cy - face.r"
        :width="face.r * 2"
        :height="face.r * 2"
        preserveAspectRatio="xMidYMid slice"
        :clip-path="`url(#${clipId})`"
      />
    </template>
    <image
      v-else-if="stageImage"
      :href="stageImage"
      :x="ART.x"
      :y="ART.y"
      :width="ART.width"
      :height="ART.height"
      preserveAspectRatio="xMidYMax meet"
    />
    <svg
      v-else
      :x="ART.x + 40"
      :y="ART.y"
      :width="ART.width - 80"
      :height="ART.height"
      viewBox="0 0 100 150"
    >
      <BuiltinPlant :stage="builtin ?? 0" />
    </svg>

    <!-- Plot badge. -->
    <g :transform="`translate(${W - 150}, 130)`">
      <rect x="0" y="0" width="110" height="52" rx="26" :fill="theme" />
      <text x="55" y="34" text-anchor="middle" font-size="22" font-weight="700" fill="#fff">
        ต้นที่ {{ plant.plotIndex }}
      </text>
    </g>

    <text
      :x="W / 2"
      y="660"
      text-anchor="middle"
      :font-size="name.size"
      font-weight="700"
      fill="#1f2937"
    >
      {{ name.text }}
    </text>
    <text
      v-for="(line, i) in message"
      :key="i"
      :x="W / 2"
      :y="706 + i * 40"
      text-anchor="middle"
      font-size="30"
      fill="#374151"
    >
      {{ line }}
    </text>

    <g v-if="mix.length === 2" :transform="`translate(80, ${H - 98})`">
      <rect x="0" y="0" :width="(560 * mix[0].pct) / 100" height="16" rx="8" :fill="mix[0].color" />
      <rect
        :x="(560 * mix[0].pct) / 100"
        y="0"
        :width="(560 * mix[1].pct) / 100"
        height="16"
        rx="8"
        :fill="mix[1].color"
      />
      <text x="280" y="40" text-anchor="middle" font-size="18" fill="#6b7280">{{ mixLabel }}</text>
    </g>

    <text
      :x="W / 2"
      :y="H - 26"
      text-anchor="middle"
      font-size="20"
      font-weight="700"
      :fill="theme"
    >
      {{ footer }}
    </text>
  </svg>
</template>

<style scoped>
.garden-card {
  display: block;
  width: 100%;
  height: auto;
}
</style>
