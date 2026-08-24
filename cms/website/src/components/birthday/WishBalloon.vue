<script setup lang="ts">
/**
 * One balloon with its gift on a string — the single piece of artwork this feature owns.
 *
 * The form preview and the floating wall both render this component, so a visitor frames
 * their photo against exactly the picture everyone else will see. It draws and nothing
 * else: no animation, no data fetching. The wall supplies the rise, the form supplies the
 * drag handling.
 *
 * Size comes from the `--balloon-w` custom property on any ancestor, so the same markup
 * serves a thumbnail and a full-height preview.
 */
import { computed } from 'vue';
import {
  DEFAULT_COLOR,
  DEFAULT_FRAMING,
  isLightColor,
  lighten,
  nextBalloonUid,
  outlineColor,
  photoRect,
  shapeById,
  type PhotoFraming,
} from './balloon';
import { useImageAspect } from './useImageAspect';

const props = withDefaults(
  defineProps<{
    shape?: string | null;
    color?: string | null;
    photoUrl?: string | null;
    framing?: PhotoFraming | null;
    giftImage?: string | null;
    /** Printed on the gift tag — the person sending the wish. */
    name?: string | null;
    /** Renders as a button that emits `open`; the wall uses this, the preview does not. */
    interactive?: boolean;
    /** Off while framing a photo, where the string and present are a distraction. */
    showGift?: boolean;
  }>(),
  {
    shape: 'round',
    color: DEFAULT_COLOR,
    photoUrl: null,
    framing: null,
    giftImage: null,
    name: '',
    interactive: false,
    showGift: true,
  },
);

defineEmits<{ open: [] }>();

const uid = nextBalloonUid();

const shape = computed(() => shapeById(props.shape));
const color = computed(() => props.color || DEFAULT_COLOR);
const framing = computed(() => props.framing ?? { ...DEFAULT_FRAMING });

/**
 * Placing the photo needs its shape, which is not known until it loads — so it is held back
 * until then rather than drawn square and jumping into place. The balloon body is already
 * on screen underneath, and the probe is the same fetch the `<image>` would make anyway.
 */
const aspect = useImageAspect(() => props.photoUrl);
const photo = computed(() =>
  props.photoUrl && aspect.value
    ? { href: props.photoUrl, ...photoRect(aspect.value, framing.value) }
    : null,
);

const crown = computed(() => lighten(color.value, 0.45));
const edge = computed(() => outlineColor(color.value));
const ribbon = computed(() => lighten(color.value, 0.7));
const tagText = computed(() => (isLightColor(color.value) ? '#1f2937' : '#ffffff'));

const label = computed(() =>
  props.name ? `คำอวยพรจาก ${props.name} — กดเพื่ออ่าน` : 'กดเพื่ออ่านคำอวยพร',
);

/**
 * How much the tag's own text shrinks, on top of the assembly's font size.
 *
 * A tag one balloon wide holds about twenty characters a line at full size, so a name past
 * that used to lose its tail to an ellipsis. It gets two lines here (see the stylesheet)
 * and, past the length two full-size lines hold, a smaller face — which buys roughly a
 * third more characters per line and covers the 60 the form allows. It stops at 0.85
 * rather than following the length down: below that the name stops being readable across
 * the sky, which is the only reason it is on the balloon at all.
 */
const tagScale = computed(() => ((props.name ?? '').trim().length > 22 ? 0.85 : 1));
</script>

<template>
  <component
    :is="interactive ? 'button' : 'div'"
    :type="interactive ? 'button' : undefined"
    class="assembly"
    :class="{ 'assembly-interactive': interactive }"
    :aria-label="interactive ? label : undefined"
    @click="interactive && $emit('open')"
  >
    <svg class="balloon" viewBox="0 0 100 104" role="img" :aria-label="`ลูกโป่งรูปทรง${shape.label}`">
      <defs>
        <!-- Light falls from the upper left, so the crown sits off-centre. -->
        <radialGradient :id="`${uid}-fill`" cx="35%" cy="26%" r="78%">
          <stop offset="0%" :stop-color="crown" />
          <stop offset="62%" :stop-color="color" />
          <stop offset="100%" :stop-color="edge" />
        </radialGradient>
        <clipPath :id="`${uid}-clip`">
          <path :d="shape.path" />
        </clipPath>
      </defs>

      <path :d="shape.path" :fill="`url(#${uid}-fill)`" />

      <!--
        The photo is drawn at the size it covers the box at and clipped to the body, so the
        shape is always full whatever the framing: panning slides the picture behind the
        clip rather than dragging its own edge into view. See `photoRect`.
      -->
      <g v-if="photo" :clip-path="`url(#${uid}-clip)`">
        <image
          :href="photo.href"
          :x="photo.x"
          :y="photo.y"
          :width="photo.width"
          :height="photo.height"
        />
        <!-- A whisper of the chosen colour over the photo, so the balloon still reads as that colour. -->
        <path :d="shape.path" :fill="color" opacity="0.16" />
      </g>

      <!--
        Highlight last: it must sit over the photo, or the balloon looks flat once one is
        added. Clipped, because the upper left of the box is outside the body on the
        pointier shapes — on a star it would otherwise float beside the balloon as a smudge.
      -->
      <g :clip-path="`url(#${uid}-clip)`">
        <ellipse cx="33" cy="27" rx="9" ry="13" fill="#fff" opacity="0.35" transform="rotate(-22 33 27)" />
      </g>
      <path :d="shape.path" fill="none" :stroke="edge" stroke-width="1.4" opacity="0.55" />

      <!-- Knot, then the string running to the bottom edge so it meets the ribbon below seamlessly. -->
      <path
        v-if="shape.knot"
        :d="`M${shape.tie.x - 4} ${shape.tie.y - 1} L${shape.tie.x + 4} ${shape.tie.y - 1} L${shape.tie.x} ${shape.tie.y + 6} Z`"
        :fill="edge"
      />
      <path
        :d="`M${shape.tie.x} ${shape.tie.y + (shape.knot ? 5 : 0)} L50 104`"
        fill="none"
        :stroke="edge"
        stroke-width="1.2"
        opacity="0.7"
      />
    </svg>

    <!-- `preserveAspectRatio: none` lets one curve stretch to whatever gap the layout leaves. -->
    <svg
      v-if="showGift"
      class="string"
      viewBox="0 0 20 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d="M10 0 C3 26 17 58 10 100" fill="none" :stroke="edge" stroke-width="1.6" opacity="0.7" />
    </svg>

    <div v-if="showGift" class="gift">
      <img v-if="giftImage" :src="giftImage" alt="" loading="lazy" class="gift-img" />
      <svg v-else class="gift-img" viewBox="0 0 100 88" aria-hidden="true">
        <rect x="10" y="30" width="80" height="56" rx="6" :fill="color" />
        <rect x="4" y="20" width="92" height="16" rx="5" :fill="edge" />
        <rect x="43" y="20" width="14" height="66" :fill="ribbon" />
        <path
          d="M50 22 C42 22 30 18 30 10 C30 4 38 2 43 6 C47 9 50 15 50 22 C50 15 53 9 57 6 C62 2 70 4 70 10 C70 18 58 22 50 22 Z"
          :fill="ribbon"
        />
      </svg>
    </div>

    <!--
      Outside `.gift`, so the tag is not boxed into the present's 46% and a longer name
      has the whole assembly width to sit in.
    -->
    <span
      v-if="showGift && name"
      class="gift-tag"
      :style="{ background: color, color: tagText, '--tag-scale': tagScale }"
    >{{ name }}</span>
  </component>
</template>

<style scoped>
.assembly {
  --w: var(--balloon-w, 120px);
  display: flex;
  flex-direction: column;
  align-items: center;
  width: var(--w);
  padding: 0;
  border: 0;
  background: none;
  /*
   * Every part scales from one number, so a balloon keeps its proportions at any size —
   * except that the name has to stay readable, and pure proportion stops being readable
   * first. On a phone `--w / 12` lands around 9px, so the floor takes over there and the
   * ratio goes back to governing everywhere the balloon is big enough to afford it.
   */
  font-size: max(11px, calc(var(--w) / 12));
}
.assembly-interactive {
  cursor: pointer;
  transition: transform 0.18s ease;
}
.assembly-interactive:hover,
.assembly-interactive:focus-visible {
  transform: scale(1.06);
}
.assembly-interactive:focus-visible {
  outline: 3px solid #1d4ed8;
  outline-offset: 4px;
  border-radius: 12px;
}

.balloon {
  width: 100%;
  /* Matches the 100×104 viewBox, so the knot is never clipped. */
  aspect-ratio: 100 / 104;
  filter: drop-shadow(0 6px 10px rgb(0 0 0 / 18%));
}

.string {
  width: 22%;
  height: calc(var(--w) * 0.3);
}

/* Share of the balloon's width. Raising this makes the whole assembly taller, so
   `ASSEMBLY_RATIO` in BalloonSky.vue — which spaces the wall by that height — has to move
   with it. */
.gift {
  width: 62%;
  display: flex;
  justify-content: center;
}
.gift-img {
  width: 100%;
  aspect-ratio: 100 / 88;
  object-fit: contain;
  filter: drop-shadow(0 4px 6px rgb(0 0 0 / 20%));
}

/*
 * Sits under the present, in flow — the assembly simply grows by the height of the tag.
 *
 * Two lines, wrapped and centred, rather than one line cut short: a name is the one piece
 * of the balloon that is nobody else's, and half of one is worse than a smaller whole. The
 * radius is half a single line's height, so a short name is still the pill it always was
 * and a wrapped one rounds off instead of turning into a lozenge. Anything past two lines
 * at the reduced size — far longer than the form's limit in practice — is left to the card.
 *
 * Raising the line count or the leading here makes the whole assembly taller, so
 * `ASSEMBLY_RATIO` in BalloonSky.vue has to move with it.
 */
.gift-tag {
  margin-top: 0.45em;
  max-width: 100%;
  padding: 0.25em 0.7em;
  border-radius: 0.95em;
  /* Never below the floor `.assembly` sets for itself: a shrunk tag still has to be read. */
  font-size: max(11px, calc(1em * var(--tag-scale, 1)));
  font-weight: 700;
  line-height: 1.35;
  text-align: center;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  /* Thai runs without spaces, so a long name has to be allowed to break mid-word. */
  overflow-wrap: anywhere;
  word-break: break-word;
  box-shadow: 0 2px 5px rgb(0 0 0 / 22%);
}

@media (prefers-reduced-motion: reduce) {
  .assembly-interactive {
    transition: none;
  }
  .assembly-interactive:hover {
    transform: none;
  }
}
</style>
