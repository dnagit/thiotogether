<script setup lang="ts">
/**
 * One wish as a greeting card.
 *
 * Drawn entirely in SVG rather than HTML so the on-screen card and the saved PNG are the
 * same artwork — `svgToPng` rasterises this very element. That rules out HTML text
 * (which SVG cannot lay out for us), so the message is wrapped in advance by
 * `layoutCard` and emitted one `<text>` per line.
 *
 * The parent reaches the element through the exposed `svg` ref to export it.
 */
import { computed, ref } from 'vue';
import {
  inkColor,
  lighten,
  nextBalloonUid,
  outlineColor,
  photoRect,
  shapeById,
  type PhotoFraming,
} from './balloon';
import { useImageAspect } from './useImageAspect';
import { CARD_FONT, CARD_WIDTH, layoutCard, measureText } from './wishCard';

const props = defineProps<{
  name: string;
  message: string;
  balloonShape: string;
  balloonColor: string;
  photoUrl?: string | null;
  framing?: PhotoFraming | null;
  giftName?: string | null;
  giftImage?: string | null;
  /** Event heading printed above the greeting, e.g. "อวยพรวันเกิดพี่เจี๊ยบ". */
  eventTitle?: string | null;
  celebrantName?: string | null;
  createdAt?: string | null;
}>();

const svg = ref<SVGSVGElement | null>(null);
defineExpose({ svg });

const uid = nextBalloonUid();
const shape = computed(() => shapeById(props.balloonShape));
const color = computed(() => props.balloonColor || '#0ea5e9');
const crown = computed(() => lighten(color.value, 0.45));
const edge = computed(() => outlineColor(color.value));
/** Text, which needs more contrast than an outline does — the paper is tinted from the same colour. */
const ink = computed(() => inkColor(color.value));
const paper = computed(() => lighten(color.value, 0.94));

const aspect = useImageAspect(() => props.photoUrl);
const photo = computed(() =>
  props.photoUrl && aspect.value
    ? { href: props.photoUrl, ...photoRect(aspect.value, props.framing ?? { zoom: 1, x: 0, y: 0 }) }
    : null,
);

const layout = computed(() => layoutCard(props.message));
const height = computed(() => layout.value.height);

const greeting = computed(() =>
  props.celebrantName ? `สุขสันต์วันเกิด ${props.celebrantName}` : 'สุขสันต์วันเกิด',
);

/** Footer rows are anchored to the bottom edge so a short wish does not leave them stranded. */
const dividerY = computed(() => height.value - 190);
const giftY = computed(() => height.value - 138);
const fromY = computed(() => height.value - 82);
const dateY = computed(() => height.value - 40);

const giftLabel = computed(() => (props.giftName ? `ของขวัญ: ${props.giftName}` : ''));
/**
 * The gift row is an icon followed by its caption, centred as one unit — so the caption is
 * measured to find where the pair should start.
 */
const giftRow = computed(() => {
  const textWidth = measureText(giftLabel.value, 22);
  const iconWidth = props.giftImage ? 40 : 0;
  const total = textWidth + iconWidth;
  const left = (CARD_WIDTH - total) / 2;
  return { iconX: left, textX: left + iconWidth };
});

const dateLabel = computed(() => {
  if (!props.createdAt) return '';
  const date = new Date(props.createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
});

/** Confetti, placed from a fixed table so a card looks identical every time it is drawn. */
const CONFETTI = [
  [60, 250, 7], [660, 300, 6], [90, 430, 5], [640, 460, 8],
  [46, 640, 6], [676, 620, 5], [120, 150, 5], [600, 180, 7],
] as const;
</script>

<template>
  <svg
    ref="svg"
    class="card"
    :viewBox="`0 0 ${CARD_WIDTH} ${height}`"
    role="img"
    :aria-label="`การ์ดอวยพรจาก ${name}: ${message}`"
  >
    <defs>
      <linearGradient :id="`${uid}-paper`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffffff" />
        <stop offset="100%" :stop-color="paper" />
      </linearGradient>
      <radialGradient :id="`${uid}-fill`" cx="35%" cy="26%" r="78%">
        <stop offset="0%" :stop-color="crown" />
        <stop offset="62%" :stop-color="color" />
        <stop offset="100%" :stop-color="edge" />
      </radialGradient>
      <clipPath :id="`${uid}-clip`">
        <path :d="shape.path" />
      </clipPath>
    </defs>

    <rect :width="CARD_WIDTH" :height="height" :fill="`url(#${uid}-paper)`" />
    <rect
      x="14"
      y="14"
      :width="CARD_WIDTH - 28"
      :height="height - 28"
      rx="26"
      fill="none"
      :stroke="color"
      stroke-width="3"
      opacity="0.35"
    />

    <circle
      v-for="([cx, cy, r], i) in CONFETTI"
      :key="i"
      :cx="cx"
      :cy="cy"
      :r="r"
      :fill="color"
      opacity="0.22"
    />

    <!-- Header -->
    <text
      v-if="eventTitle"
      :x="CARD_WIDTH / 2"
      y="78"
      text-anchor="middle"
      :font-family="CARD_FONT"
      font-size="22"
      fill="#6b7280"
    >
      {{ eventTitle }}
    </text>
    <text
      :x="CARD_WIDTH / 2"
      y="134"
      text-anchor="middle"
      :font-family="CARD_FONT"
      font-size="38"
      font-weight="800"
      :fill="ink"
    >
      {{ greeting }}
    </text>

    <!-- Balloon: the 100-unit box scaled to 260 and centred. -->
    <g transform="translate(230 175) scale(2.6)">
      <path :d="shape.path" :fill="`url(#${uid}-fill)`" />
      <g v-if="photo" :clip-path="`url(#${uid}-clip)`">
        <!-- Sized to cover the box rather than sliced into it, so the framing pans the
             picture behind the clip instead of dragging its edge in. See `photoRect`. -->
        <image
          :href="photo.href"
          :x="photo.x"
          :y="photo.y"
          :width="photo.width"
          :height="photo.height"
        />
        <path :d="shape.path" :fill="color" opacity="0.16" />
      </g>
      <g :clip-path="`url(#${uid}-clip)`">
        <ellipse cx="33" cy="27" rx="9" ry="13" fill="#fff" opacity="0.35" transform="rotate(-22 33 27)" />
      </g>
      <path :d="shape.path" fill="none" :stroke="edge" stroke-width="1.4" opacity="0.55" />
      <path
        v-if="shape.knot"
        :d="`M${shape.tie.x - 4} ${shape.tie.y - 1} L${shape.tie.x + 4} ${shape.tie.y - 1} L${shape.tie.x} ${shape.tie.y + 6} Z`"
        :fill="edge"
      />
    </g>

    <!-- Message, one pre-wrapped line at a time. -->
    <text
      :x="CARD_WIDTH / 2"
      text-anchor="middle"
      :font-family="CARD_FONT"
      :font-size="layout.fontSize"
      fill="#1f2937"
    >
      <tspan
        v-for="(line, i) in layout.lines"
        :key="i"
        :x="CARD_WIDTH / 2"
        :y="layout.messageTop + i * layout.lineHeight"
      >{{ line }}</tspan>
    </text>

    <!-- Footer -->
    <line
      :x1="120"
      :y1="dividerY"
      :x2="CARD_WIDTH - 120"
      :y2="dividerY"
      :stroke="color"
      stroke-width="2"
      opacity="0.3"
    />

    <template v-if="giftLabel">
      <image
        v-if="giftImage"
        :href="giftImage"
        :x="giftRow.iconX"
        :y="giftY - 24"
        width="32"
        height="32"
        preserveAspectRatio="xMidYMid meet"
      />
      <text
        :x="giftRow.textX"
        :y="giftY"
        :font-family="CARD_FONT"
        font-size="22"
        fill="#6b7280"
      >
        {{ giftLabel }}
      </text>
    </template>

    <text
      :x="CARD_WIDTH / 2"
      :y="fromY"
      text-anchor="middle"
      :font-family="CARD_FONT"
      font-size="30"
      font-weight="700"
      :fill="ink"
    >
      จาก {{ name }}
    </text>
    <text
      v-if="dateLabel"
      :x="CARD_WIDTH / 2"
      :y="dateY"
      text-anchor="middle"
      :font-family="CARD_FONT"
      font-size="20"
      fill="#9ca3af"
    >
      {{ dateLabel }}
    </text>
  </svg>
</template>

<style scoped>
.card {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 18px;
  box-shadow: 0 10px 30px rgb(0 0 0 / 14%);
}
</style>
