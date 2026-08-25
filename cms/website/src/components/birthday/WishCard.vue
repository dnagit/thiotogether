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
  DEFAULT_COLOR,
  inkColor,
  isLightColor,
  lighten,
  nextBalloonUid,
  outlineColor,
  photoRect,
  shapeById,
  type PhotoFraming,
} from './balloon';
import { useImageAspect } from './useImageAspect';
import {
  CARD_COLUMN,
  CARD_FONT,
  CARD_LEAF,
  CARD_PICTURE,
  CARD_WIDTH,
  fitName,
  layoutCard,
  measureText,
} from './wishCard';

const props = defineProps<{
  name: string;
  message: string;
  balloonShape: string;
  balloonColor: string;
  photoUrl?: string | null;
  framing?: PhotoFraming | null;
  /** The picture chosen with the wish, shown in the frame on the right. */
  backgroundUrl?: string | null;
  giftImage?: string | null;
}>();

const svg = ref<SVGSVGElement | null>(null);
defineExpose({ svg });

const uid = nextBalloonUid();
const shape = computed(() => shapeById(props.balloonShape));
const color = computed(() => props.balloonColor || DEFAULT_COLOR);
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

/**
 * The leaf and the picture on it, stretched by however much a long wish pushed the card
 * taller. The rows below the message move down by the same amount.
 */
const leaf = computed(() => ({ ...CARD_LEAF, height: CARD_LEAF.height + layout.value.overflow }));
const picture = computed(() => ({
  ...CARD_PICTURE,
  height: CARD_PICTURE.height + layout.value.overflow,
}));
/** Right edge of the writing column: the signature hangs off it. */
const columnRight = CARD_COLUMN.x + CARD_COLUMN.width;
/** Set smaller, and cut, rather than allowed to run off the leaf. */
const signature = computed(() => fitName(props.name));

/**
 * The whole balloon assembly, in the balloon's own 100-wide box units.
 *
 * `WishBalloon.vue` builds this out of flexbox and percentages of one width; here it has to
 * be drawn, so the same proportions are written out as offsets down a single column. They
 * are its numbers, not new ones — the string is 22% of the width and 0.3 of it tall, the
 * present 62%, the tag is set at width/12 — so the card's balloon and the one floating on
 * the wall are the same object at different sizes.
 */
const BOX = 100;
const BALLOON_H = 104;
const STRING = { top: BALLOON_H, width: 22, height: 30 };
const GIFT = { top: STRING.top + STRING.height, width: 62, height: 62 * 0.88 };
const TAG_FONT = BOX / 12;
const TAG = { top: GIFT.top + GIFT.height + TAG_FONT * 0.45, height: TAG_FONT * 1.85 };
const ASSEMBLY_H = TAG.top + TAG.height;

/**
 * The name on its tag: capped at the balloon's own width, as the wall caps it, and cut with
 * an ellipsis where the wall would let CSS do it.
 */
const tag = computed(() => {
  const padding = TAG_FONT * 0.7;
  const room = BOX - padding * 2;
  let label = props.name;
  if (measureText(label, TAG_FONT, '700') > room) {
    while (label.length > 1 && measureText(`${label}…`, TAG_FONT, '700') > room) {
      label = label.slice(0, -1);
    }
    label = `${label}…`;
  }
  return { label, width: Math.min(BOX, measureText(label, TAG_FONT, '700') + padding * 2) };
});

/**
 * Sized to the frame rather than to a fixed number: the assembly is over twice as tall as
 * the balloon alone, so what fits is decided by the frame's height nearly every time.
 */
const balloonSpot = computed(() => {
  const scale = Math.min(
    (picture.value.width - 40) / BOX,
    (picture.value.height - 60) / ASSEMBLY_H,
  );
  return {
    scale,
    x: picture.value.x + (picture.value.width - BOX * scale) / 2,
    y: picture.value.y + (picture.value.height - ASSEMBLY_H * scale) / 2,
  };
});

const ribbon = computed(() => lighten(color.value, 0.7));
const tagInk = computed(() => (isLightColor(color.value) ? '#1f2937' : '#ffffff'));

/** The wall's string curve — `M10 0 C3 26 17 58 10 100` in a 20 × 100 box — put in box units. */
const stringPath = (() => {
  const at = (x: number, y: number) =>
    `${((BOX - STRING.width) / 2 + (x * STRING.width) / 20).toFixed(1)} ` +
    `${(STRING.top + (y * STRING.height) / 100).toFixed(1)}`;
  return `M${at(10, 0)} C${at(3, 26)} ${at(17, 58)} ${at(10, 100)}`;
})();

/**
 * The present is drawn to its own 100 × 88 proportions, however the file is shaped, and
 * centred over the writing column rather than ranged left with the text — a picture hung on
 * the same margin as a paragraph reads as a bullet beside it.
 */
const giftBox = {
  x: CARD_COLUMN.x + (CARD_COLUMN.width - CARD_COLUMN.giftSize) / 2,
  y: CARD_COLUMN.giftY,
  width: CARD_COLUMN.giftSize,
  height: Math.round((CARD_COLUMN.giftSize * 88) / 100),
};
</script>

<template>
  <svg
    ref="svg"
    class="card"
    :viewBox="`0 0 ${CARD_WIDTH} ${height}`"
    role="img"
    :aria-label="`Birthday card from ${name}: ${message}`"
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
      <!-- The picture is cropped to fill its frame; nothing pans across it. -->
      <clipPath :id="`${uid}-picture`">
        <rect
          :x="picture.x"
          :y="picture.y"
          :width="picture.width"
          :height="picture.height"
          :rx="picture.radius"
        />
      </clipPath>
    </defs>

    <!--
      The card's own artwork, the same for every wish: it carries the party's title and the
      border, so nothing here reprints them. It is 4:5 and so is the card, so `slice` only
      ever crops on the rare wish long enough to have stretched the card taller.
    -->
    <rect :width="CARD_WIDTH" :height="height" fill="#fdf6e6" />
    <image
      href="/images/bg-card.png"
      x="0"
      y="0"
      :width="CARD_WIDTH"
      :height="height"
      preserveAspectRatio="xMidYMid slice"
    />

    <!-- The leaf the wish is written on. -->
    <rect
      :x="leaf.x"
      :y="leaf.y"
      :width="leaf.width"
      :height="leaf.height"
      :rx="leaf.radius"
      fill="#fffdf6"
      opacity="0.96"
    />

    <!-- Right: the picture chosen with the wish, or tinted paper when none was. -->
    <g :clip-path="`url(#${uid}-picture)`">
      <image
        v-if="backgroundUrl"
        :href="backgroundUrl"
        :x="picture.x"
        :y="picture.y"
        :width="picture.width"
        :height="picture.height"
        preserveAspectRatio="xMidYMid slice"
      />
      <rect
        v-else
        :x="picture.x"
        :y="picture.y"
        :width="picture.width"
        :height="picture.height"
        :fill="`url(#${uid}-paper)`"
      />
    </g>

    <!-- The balloon, sitting on the picture. -->
    <g :transform="`translate(${balloonSpot.x} ${balloonSpot.y}) scale(${balloonSpot.scale})`">
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

      <!-- Knot, then the string running to the bottom edge of the balloon's own box. -->
      <path
        v-if="shape.knot"
        :d="`M${shape.tie.x - 4} ${shape.tie.y - 1} L${shape.tie.x + 4} ${shape.tie.y - 1} L${shape.tie.x} ${shape.tie.y + 6} Z`"
        :fill="edge"
      />
      <path
        :d="`M${shape.tie.x} ${shape.tie.y + (shape.knot ? 5 : 0)} L50 ${BALLOON_H}`"
        fill="none"
        :stroke="edge"
        stroke-width="1.2"
        opacity="0.7"
      />

      <!--
        …and on down to the present. The wall's curve is written into box units rather than
        scaled from its own 20 × 100 viewport: that scaling is 1.1 across and 0.3 down, and a
        stroke put through it comes out flattened to a third of its width on the verticals.
      -->
      <path
        :d="stringPath"
        fill="none"
        :stroke="edge"
        stroke-width="1.6"
        opacity="0.7"
      />

      <!-- The present, drawn from the catalogue picture or from the plain box. -->
      <image
        v-if="giftImage"
        :href="giftImage"
        :x="(BOX - GIFT.width) / 2"
        :y="GIFT.top"
        :width="GIFT.width"
        :height="GIFT.height"
        preserveAspectRatio="xMidYMid meet"
      />
      <g
        v-else
        :transform="`translate(${(BOX - GIFT.width) / 2} ${GIFT.top}) scale(${GIFT.width / 100})`"
      >
        <rect x="10" y="30" width="80" height="56" rx="6" :fill="color" />
        <rect x="4" y="20" width="92" height="16" rx="5" :fill="edge" />
        <rect x="43" y="20" width="14" height="66" :fill="ribbon" />
        <path
          d="M50 22 C42 22 30 18 30 10 C30 4 38 2 43 6 C47 9 50 15 50 22 C50 15 53 9 57 6 C62 2 70 4 70 10 C70 18 58 22 50 22 Z"
          :fill="ribbon"
        />
      </g>

      <!-- The name tag, hung under the present. -->
      <g v-if="tag.label">
        <rect
          :x="(BOX - tag.width) / 2"
          :y="TAG.top"
          :width="tag.width"
          :height="TAG.height"
          :rx="TAG.height / 2"
          :fill="color"
        />
        <text
          :x="BOX / 2"
          :y="TAG.top + TAG.height * 0.71"
          text-anchor="middle"
          :font-family="CARD_FONT"
          :font-size="TAG_FONT"
          font-weight="700"
          :fill="tagInk"
        >{{ tag.label }}</text>
      </g>
    </g>

    <!-- Left: the present at the head of the column, then the wish beneath it. -->
    <image
      v-if="giftImage"
      :href="giftImage"
      :x="giftBox.x"
      :y="giftBox.y"
      :width="giftBox.width"
      :height="giftBox.height"
      preserveAspectRatio="xMidYMid meet"
    />
    <text
      :x="CARD_COLUMN.x"
      :font-family="CARD_FONT"
      :font-size="layout.fontSize"
      fill="#1f2937"
    >
      <tspan
        v-for="(line, i) in layout.lines"
        :key="i"
        :x="CARD_COLUMN.x"
        :y="layout.messageTop + i * layout.lineHeight"
      >{{ line }}</tspan>
    </text>

    <!-- Signed off against the column's right edge, on the line after the wish. -->
    <text
      :x="columnRight"
      :y="layout.nameY"
      text-anchor="end"
      :font-family="CARD_FONT"
      :font-size="signature.size"
      font-weight="700"
      :fill="ink"
    >{{ signature.text }}</text>
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
