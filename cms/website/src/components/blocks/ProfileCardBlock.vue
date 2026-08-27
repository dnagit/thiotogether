<script setup lang="ts">
/**
 * A profile poster: one decorated sheet with a cut-out figure, a details card and a scatter
 * of moving props.
 *
 * Four layers stacked on one stage — the frame, the figure, the column of facts, and the
 * loose decorations on top. Nothing here is positioned in pixels: the stage holds an aspect
 * ratio and is a container, so every offset is a share of its width (`cqw`) and the whole
 * composition scales as one picture from a phone to a desktop. That is what keeps the
 * flower, the drumstick and the basketball on the same spot of the artwork at any size.
 *
 * The artwork is all uploads. The frame carries its own background, so a single file is both
 * the border and what sits behind everything — which is how the poster was drawn, and stops
 * the CMS from having to guess where a border ends.
 */
import { computed } from 'vue';

/** A link in the top row: the icon is an upload, so any platform is possible. */
interface Social {
  icon?: string;
  url?: string;
  /** Read out to screen readers; the icon itself is decorative. */
  label?: string;
}

/** A line in the details card, e.g. "DATE OF BIRTH — 20 Sep 2005". */
interface CardRow {
  label?: string;
  value?: string;
}

/** A pill in the stack down the right: "HEIGHT : 205 CM". */
interface Fact {
  text?: string;
  /** Stands in for the bullet — a heart, a star, whatever was uploaded. */
  icon?: string;
}

/** One of the round badges: a picture over a caption. */
interface Trait {
  image?: string;
  label?: string;
  color?: string;
}

/**
 * A prop lying on top of the poster.
 *
 * `x` / `y` are the centre of the piece as a percentage of the stage, `size` its width in the
 * same terms — so a decoration keeps its place and its proportion whatever the screen does.
 */
interface Decoration {
  image?: string;
  x?: number | string;
  y?: number | string;
  size?: number | string;
  motion?: 'spin' | 'swing' | 'float' | 'none';
  /** Seconds for one full turn, swing or bob. */
  speed?: number | string;
  label?: string;
}

const props = withDefaults(
  defineProps<{
    /** Poster shape, width ÷ height. The reference sheet is a tall portrait. */
    ratio?: number | string;
    /** How wide the poster may grow on a desktop, in pixels. */
    maxWidth?: number | string;
    /** Paper colour behind the frame, for a frame drawn with transparency. */
    background?: string;
    /** Border and background in one file — see the note at the top. */
    frameImage?: string;
    /** The cut-out figure down the left. */
    personImage?: string;

    /** The name plate. An upload wins; the text is the fallback. */
    nameplateImage?: string;
    nameplateText?: string;
    nameplateColor?: string;

    /** The details card under the social row. */
    cardImage?: string;
    cardColor?: string;
    cardPhoto?: string;
    cardRows?: CardRow[];
    /** The handwritten line along the bottom of the card. */
    cardNote?: string;

    socials?: Social[];
    facts?: Fact[];
    traits?: Trait[];
    /** The wider pills below the badges — likes, star sign, and so on. */
    tags?: Fact[];
    decorations?: Decoration[];

    /** Pill and badge colours, so one poster can be re-skinned without new art. */
    accent?: string;
    pillColor?: string;
    textColor?: string;
  }>(),
  {
    ratio: 0.56,
    maxWidth: 560,
    background: '#fffdf6',
    nameplateColor: '#f4a300',
    cardColor: '#fff6ef',
    cardRows: () => [],
    socials: () => [],
    facts: () => [],
    traits: () => [],
    tags: () => [],
    decorations: () => [],
    accent: '#ea480c',
    pillColor: '#f4a300',
    textColor: '#3b2a12',
  },
);

/** A number from a prop the CMS may hand over as a string, with a floor and a ceiling. */
function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

const stageStyle = computed(() => ({
  aspectRatio: String(num(props.ratio, 0.56, 0.3, 3)),
  maxWidth: `${num(props.maxWidth, 560, 240, 1600)}px`,
  background: props.background,
  '--accent': props.accent,
  '--pill': props.pillColor,
  '--ink': props.textColor,
}));

/**
 * A decoration's box, as percentages of the stage.
 *
 * Anchored by its centre rather than its corner: an author placing the basketball thinks
 * about where the ball sits, not where its top-left corner lands, and a piece nudged bigger
 * then grows around that point instead of sliding away from it.
 */
function decorStyle(d: Decoration): Record<string, string> {
  const size = num(d.size, 18, 2, 120);
  return {
    left: `${num(d.x, 50, -20, 120)}%`,
    top: `${num(d.y, 50, -20, 120)}%`,
    width: `${size}cqw`,
    '--speed': `${num(d.speed, 8, 0.5, 120)}s`,
  };
}

const motionOf = (d: Decoration): string => `motion-${d.motion ?? 'none'}`;

/** Router links keep in-app navigation; anything absolute has to leave through a plain anchor. */
const isExternal = (url: string): boolean => /^(https?:)?\/\/|^mailto:|^tel:/i.test(url);
</script>

<template>
  <div class="wrap">
    <div class="stage" :style="stageStyle">
      <!-- L0 · the sheet itself: border and background as the one upload -->
      <img v-if="frameImage" :src="frameImage" alt="" class="frame" />

      <!-- L1 · the figure, standing on the bottom edge -->
      <img v-if="personImage" :src="personImage" alt="" class="person" />

      <!-- L2 · everything that is read -->
      <div class="column">
        <div v-if="socials.length" class="socials">
          <component
            :is="s.url ? (isExternal(s.url) ? 'a' : 'RouterLink') : 'span'"
            v-for="(s, i) in socials"
            :key="i"
            v-bind="
              s.url
                ? isExternal(s.url)
                  ? { href: s.url, target: '_blank', rel: 'noopener noreferrer' }
                  : { to: s.url }
                : {}
            "
            class="social"
            :aria-label="s.label || undefined"
          >
            <img v-if="s.icon" :src="s.icon" alt="" />
            <span v-else class="social-dot" aria-hidden="true"></span>
          </component>
        </div>

        <!-- The details card: its own background, a portrait, then the label/value pairs. -->
        <div v-if="cardRows.length || cardPhoto" class="card" :style="{ background: cardColor }">
          <img v-if="cardImage" :src="cardImage" alt="" class="card-bg" />
          <div class="card-inner">
            <img v-if="cardPhoto" :src="cardPhoto" alt="" class="card-photo" />
            <div class="card-rows">
              <div v-for="(r, i) in cardRows" :key="i" class="card-row">
                <span class="card-label">{{ r.label }}</span>
                <span class="card-value">{{ r.value }}</span>
              </div>
            </div>
          </div>
          <span v-if="cardNote" class="card-note">{{ cardNote }}</span>
        </div>

        <!-- The name plate: artwork if there is any, lettering if not. -->
        <img v-if="nameplateImage" :src="nameplateImage" alt="" class="plate-img" />
        <span
          v-else-if="nameplateText"
          class="plate"
          :style="{ background: nameplateColor }"
        >{{ nameplateText }}</span>

        <div v-if="facts.length" class="pills">
          <span v-for="(f, i) in facts" :key="i" class="pill">
            <img v-if="f.icon" :src="f.icon" alt="" class="pill-icon" />
            <span v-else class="pill-dot" aria-hidden="true"></span>
            {{ f.text }}
          </span>
        </div>

        <div v-if="traits.length" class="traits">
          <div v-for="(t, i) in traits" :key="i" class="trait">
            <span class="trait-disc" :style="{ borderColor: t.color || 'var(--pill)' }">
              <img v-if="t.image" :src="t.image" alt="" />
            </span>
            <span class="trait-label" :style="{ color: t.color || 'var(--accent)' }">
              {{ t.label }}
            </span>
          </div>
        </div>

        <div v-if="tags.length" class="pills">
          <span v-for="(t, i) in tags" :key="i" class="pill">
            <img v-if="t.icon" :src="t.icon" alt="" class="pill-icon" />
            <span v-else class="pill-dot" aria-hidden="true"></span>
            {{ t.text }}
          </span>
        </div>
      </div>

      <!-- L3 · the props on top, each on its own loop -->
      <img
        v-for="(d, i) in decorations"
        :key="i"
        :src="d.image"
        :alt="d.label || ''"
        class="decor"
        :class="motionOf(d)"
        :style="decorStyle(d)"
      />
    </div>
  </div>
</template>

<style scoped>
.wrap {
  display: flex;
  justify-content: center;
  padding: clamp(0.75rem, 2vw, 2rem);
}

/*
 * The stage is the unit everything else is measured in. `container-type: inline-size` is what
 * makes `cqw` mean "a hundredth of the poster" rather than of the window — so the type, the
 * pills and the props all shrink together with the sheet instead of the layout coming apart
 * at the sizes between a phone and a desktop.
 */
.stage {
  container-type: inline-size;
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: 1.5cqw;
  color: var(--ink);
  font-size: 3cqw;
  line-height: 1.35;
}

.frame,
.person {
  position: absolute;
  pointer-events: none;
  user-select: none;
}
/* Drawn for this shape, so it is stretched to it rather than cropped by it. */
.frame {
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
}
/* Standing on the bottom edge of the sheet, inside the frame's border. */
.person {
  left: 1%;
  bottom: 4%;
  width: 52%;
  height: auto;
  object-fit: contain;
  z-index: 1;
}

/* Everything readable sits in one column down the right, clear of the figure. */
.column {
  position: absolute;
  top: 6%;
  right: 6%;
  left: 33%;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2.5cqw;
}

/* ── Social row ─────────────────────────────────────────────────────────────── */
.socials {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1.4cqw;
}
.social {
  display: block;
  width: 6cqw;
  height: 6cqw;
  border-radius: 1.4cqw;
  overflow: hidden;
}
.social img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.social-dot {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: var(--pill);
}

/* ── Details card ───────────────────────────────────────────────────────────── */
.card {
  position: relative;
  border-radius: 2.5cqw;
  border: 0.5cqw solid var(--accent);
  padding: 2.5cqw;
  overflow: hidden;
}
/* Behind the card's own contents, and never in the way of a click. */
.card-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}
.card-inner {
  position: relative;
  display: flex;
  gap: 2.5cqw;
  align-items: flex-start;
}
.card-photo {
  width: 30%;
  aspect-ratio: 3 / 4;
  object-fit: cover;
  border-radius: 1.5cqw;
  border: 0.4cqw solid var(--accent);
  flex: none;
}
/* Two pairs to a row on a sheet this wide; one per row would run the card down the page. */
.card-rows {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.6cqw 2cqw;
}
.card-label {
  display: block;
  font-size: 2.2cqw;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--accent);
}
.card-value {
  display: block;
  font-size: 2.2cqw;
  overflow-wrap: anywhere;
}
.card-note {
  position: relative;
  display: block;
  margin-top: 1.6cqw;
  font-size: 2.4cqw;
  font-style: italic;
  opacity: 0.75;
}

/* ── Name plate ─────────────────────────────────────────────────────────────── */
.plate-img {
  width: 62%;
  height: auto;
  align-self: center;
}
.plate {
  align-self: center;
  padding: 1.2cqw 4cqw;
  border-radius: 2cqw;
  font-size: 8cqw;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #fff;
  text-shadow: 0 0.4cqw 0 rgb(0 0 0 / 18%);
}

/* ── Fact pills ─────────────────────────────────────────────────────────────── */
.pills {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1.6cqw;
}
/*
 * Each pill is only as wide as its own words — a column of equal bars would read as a table,
 * and the ragged right edge is what makes the stack look laid out by hand.
 */
.pill {
  display: inline-flex;
  align-items: center;
  gap: 1.4cqw;
  max-width: 100%;
  padding: 1cqw 2.6cqw;
  border-radius: 999px;
  background: var(--pill);
  color: #fff;
  font-size: 2.6cqw;
  font-weight: 700;
  box-shadow: 0 0.4cqw 0.8cqw rgb(0 0 0 / 12%);
}
.pill-icon {
  width: 3.2cqw;
  height: 3.2cqw;
  object-fit: contain;
  flex: none;
}
.pill-dot {
  width: 2.2cqw;
  height: 2.2cqw;
  border-radius: 50%;
  background: rgb(255 255 255 / 85%);
  flex: none;
}

/* ── Trait badges ───────────────────────────────────────────────────────────── */
.traits {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 2cqw;
}
.trait {
  width: 26%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.8cqw;
}
.trait-disc {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 50%;
  border: 0.5cqw solid var(--pill);
  background: #fff;
  display: grid;
  place-items: center;
  overflow: hidden;
}
.trait-disc img {
  width: 74%;
  height: 74%;
  object-fit: contain;
}
.trait-label {
  font-size: 2.2cqw;
  font-weight: 800;
  text-align: center;
  letter-spacing: 0.03em;
}

/* ── Decorations ────────────────────────────────────────────────────────────── */
/*
 * Placed by their centre — see `decorStyle` — which is why the translate is baked into every
 * keyframe below rather than set once here: a transform animation replaces this one outright.
 */
.decor {
  position: absolute;
  z-index: 3;
  height: auto;
  transform: translate(-50%, -50%);
  pointer-events: none;
  user-select: none;
}
.motion-spin {
  animation: decor-spin var(--speed) linear infinite;
}
.motion-swing {
  animation: decor-swing var(--speed) ease-in-out infinite;
  transform-origin: 50% 20%;
}
.motion-float {
  animation: decor-float var(--speed) ease-in-out infinite;
}

@keyframes decor-spin {
  from {
    transform: translate(-50%, -50%) rotate(0deg);
  }
  to {
    transform: translate(-50%, -50%) rotate(360deg);
  }
}
@keyframes decor-swing {
  0%,
  100% {
    transform: translate(-50%, -50%) rotate(-14deg);
  }
  50% {
    transform: translate(-50%, -50%) rotate(14deg);
  }
}
@keyframes decor-float {
  0%,
  100% {
    transform: translate(-50%, -50%) translateY(-4%);
  }
  50% {
    transform: translate(-50%, -50%) translateY(4%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .decor {
    animation: none !important;
  }
}
</style>
