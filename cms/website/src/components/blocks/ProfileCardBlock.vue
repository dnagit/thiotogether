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
import { computed, ref } from 'vue';

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
    /**
     * Poster shape, width ÷ height.
     *
     * Left empty it follows the frame's own proportions, which is almost always what is
     * wanted: the frame is drawn as a whole sheet, so any other number stretches the artwork
     * — a border squashed 18% narrower is not a border the illustrator drew. Set it only to
     * crop deliberately, or when there is no frame image at all.
     */
    ratio?: number | string;
    /** How wide the poster may grow on a desktop, in pixels. */
    maxWidth?: number | string;
    /** Paper colour behind the frame, for a frame drawn with transparency. */
    background?: string;
    /** Border and background in one file — see the note at the top. */
    frameImage?: string;
    /** The cut-out figure down the left. */
    personImage?: string;
    /** How tall the figure stands, as a share of the poster's height. */
    personHeight?: number | string;
    /** How far in from the left edge the figure starts, as a share of the width. */
    personX?: number | string;

    /** The name plate. An upload wins; the text is the fallback. */
    nameplateImage?: string;
    /** How wide the plate is drawn, as a share of the text column. Its height follows. */
    nameplateWidth?: number | string;
    nameplateText?: string;
    nameplateColor?: string;

    /** The details card under the social row. */
    cardImage?: string;
    cardColor?: string;
    cardPhoto?: string;
    cardRows?: CardRow[];
    /** The label colour inside the card — NAME, FANCLUB and the rest. Falls back to the accent. */
    cardLabelColor?: string;
/**
     * The panel colour: the links bar's fill and the frame drawn round the whole head of the
     * sheet. One value rather than two, because the bar and the card share an edge — two
     * colours meeting there would read as a mistake, not as a detail.
     */
    socialColor?: string;
    /** Corner rounding on the bar and the card, as a share of the poster's width. */
    cardRadius?: number | string;
    /** The handwritten line along the bottom of the card. */
    cardNote?: string;

    socials?: Social[];
    facts?: Fact[];
    traits?: Trait[];
    /** The wider pills below the badges — likes, star sign, and so on. */
    tags?: Fact[];
    decorations?: Decoration[];

    /**
     * Where the reading column sits, as shares of the poster: the gap to the figure on the
     * left, the gap to the frame on the right, and where the first row starts down the top.
     * These are props because the frame is an upload — a thicker border needs the column
     * pulled in, and that is a number only the artwork knows.
     */
    columnLeft?: number | string;
    columnRight?: number | string;
    columnTop?: number | string;
    columnBottom?: number | string;
    /**
     * How far the pills, badges and tags step in from the column's own left edge.
     *
     * The card and the social row run the full width of the column; everything below is set
     * in from it. That step is what makes the sheet read as a card with a list under it
     * rather than as one block of left-aligned rows.
     */
    listIndent?: number | string;

    /** Pill and badge colours, so one poster can be re-skinned without new art. */
    accent?: string;
    pillColor?: string;
    /** The lettering on the pills, which sits on `pillColor` rather than on the paper. */
    pillTextColor?: string;
    /** The hard offset shadow under each pill — a second, darker copy rather than a blur. */
    pillShadowColor?: string;
    textColor?: string;
  }>(),
  {
    ratio: '',
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
    pillTextColor: '#000000',
    pillShadowColor: '#e87627',
    socialColor: '#d81906',
    cardRadius: 2.5,
    nameplateWidth: 52,
    pillColor: '#ffd341',
    textColor: '#3b2a12',
  },
);

/**
 * A number from a prop the CMS may hand over as a string, with a floor and a ceiling.
 *
 * An empty field has to be caught before `Number` sees it. A blank input arrives as `''`,
 * and `Number('')` is 0 — a real, finite number — so every default here would be quietly
 * overruled by the one thing that means "not set": a decoration left without coordinates
 * would sit at the very corner, and one left without a size would be clamped to the minimum
 * and disappear.
 */
function num(value: unknown, fallback: number, min: number, max: number): number {
  if (value === '' || value === null || value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * The figure is sized by its height, not its width.
 *
 * It stands on the bottom edge of the sheet, so what has to be right is where its head
 * reaches — and that is a height. Driving it from a width instead makes the figure as tall as
 * whatever proportions the cut-out was exported at, which is why a narrow file filled the
 * whole sheet. `max-width` is left as a guard for a wide export: the browser takes the
 * smaller of the two and keeps the proportions either way.
 */
const personStyle = computed(() => ({
  height: `${num(props.personHeight, 74, 15, 100)}%`,
  left: `${num(props.personX, 2, -20, 80)}%`,
}));

/**
 * The plate's width is what decides how much of the column's height it eats — the artwork's
 * proportions do the rest.
 */
const plateStyle = computed(() => ({
  width: `${num(props.nameplateWidth, 52, 10, 100)}%`,
}));

const headStyle = computed(() => ({
  '--social': props.socialColor,
  '--radius': `${num(props.cardRadius, 2.5, 0, 12)}cqw`,
}));

const columnStyle = computed(() => ({
  top: `${num(props.columnTop, 3, 0, 60)}%`,
  bottom: `${num(props.columnBottom, 5, 0, 60)}%`,
  left: `${num(props.columnLeft, 27, 0, 90)}%`,
  right: `${num(props.columnRight, 5, 0, 60)}%`,
  '--indent': `${num(props.listIndent, 13, 0, 60)}%`,
}));

/** The frame's own width ÷ height, read off the file once it loads. */
const frameRatio = ref<number | null>(null);

function onFrameLoad(e: Event): void {
  const img = e.target as HTMLImageElement;
  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
    frameRatio.value = img.naturalWidth / img.naturalHeight;
  }
}

/** An explicit setting wins; otherwise the artwork decides, and 0.56 covers a sheet with no frame. */
const stageRatio = computed(() => num(props.ratio, frameRatio.value ?? 0.56, 0.2, 4));

const stageStyle = computed(() => ({
  aspectRatio: String(stageRatio.value),
  maxWidth: `${num(props.maxWidth, 560, 240, 1600)}px`,
  background: props.background,
  '--accent': props.accent,
  '--pill': props.pillColor,
  '--pill-ink': props.pillTextColor,
  '--pill-shadow': props.pillShadowColor,
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
      <img v-if="frameImage" :src="frameImage" alt="" class="frame" @load="onFrameLoad" />

      <!-- L1 · the figure, standing on the bottom edge -->
      <img v-if="personImage" :src="personImage" alt="" class="person" :style="personStyle" />

      <!-- L2 · everything that is read -->
      <div class="column" :style="columnStyle">
        <div
          v-if="socials.length || cardRows.length || cardPhoto"
          class="card"
          :style="{ ...headStyle, background: cardColor }"
        >
          <img v-if="cardImage" :src="cardImage" alt="" class="card-bg" />

          <!-- The links bar, inside the card's own frame and rounded on every corner. -->
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

          <div v-if="cardRows.length || cardPhoto" class="card-inner">
            <img v-if="cardPhoto" :src="cardPhoto" alt="" class="card-photo" />
            <div class="card-rows">
              <div v-for="(r, i) in cardRows" :key="i" class="card-row">
                <span class="card-label" :style="{ color: cardLabelColor || accent }">{{ r.label }}</span>
                <span class="card-value">{{ r.value }}</span>
              </div>
              <!--
                Inside the grid rather than under the card, so it starts on the same line as
                the labels above it. Anywhere else it would have to be indented by hand to a
                number that changes with the portrait's width.
              -->
              <span v-if="cardNote" class="card-note">{{ cardNote }}</span>
            </div>
          </div>
        </div>

        <!-- The name plate: artwork if there is any, lettering if not. -->
        <img
          v-if="nameplateImage"
          :src="nameplateImage"
          alt=""
          class="plate-img"
          :style="plateStyle"
        />
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
            <span class="trait-disc">
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
      <template v-for="(d, i) in decorations" :key="i">
      <img
        v-if="d.image"
        :src="d.image"
        :alt="d.label || ''"
        class="decor"
        :class="motionOf(d)"
        :style="decorStyle(d)"
      />
      </template>
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
/* Standing on the bottom edge of the sheet, inside the frame's border. Height and left come
   from `personStyle`; the cap here stops a wide cut-out from crossing the column of facts —
   which is what it was doing at 52%, with the pills landing on top of the figure. */
.person {
  bottom: 3%;
  width: auto;
  max-width: 44%;
  object-fit: contain;
  object-position: bottom left;
  /*
   * Above the column, so the figure stands in front of the pills where the two overlap. It
   * takes no clicks — see the `pointer-events: none` it shares with the frame — so nothing
   * underneath it becomes unreachable by being covered.
   */
  z-index: 3;
}

/*
 * Everything readable sits in one column down the right, clear of the figure. Its edges come
 * from `columnStyle`, since where they belong depends on the frame that was uploaded.
 *
 * The rows stack from the top on a fixed gap rather than being spread down the column. Spread
 * apart they drift away from each other as the sheet gets taller — the plate and the pills end
 * up floating in the middle of the paper. Stacked, the whole group stays gathered under the
 * card, and whatever height is left over collects at the bottom where the decorations sit.
 */
.column {
  position: absolute;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 2.5cqw;
}

/* ── Social row ─────────────────────────────────────────────────────────────── */
/*
 * The head of the sheet is one panel: a solid red bar with the links on it, sitting straight
 * on top of the card, sharing its border. They are joined only when both are there — a card
 * with no links keeps its own four corners.
 */
/*
 * A solid bar in the same red as the card's frame below it. The border stays on in the same
 * colour: it is what the padding is measured against, so the bar keeps its thickness whether
 * it is filled or not.
 */
.socials {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 1.4cqw;
  position: relative;
  /*
   * Pulled back out to the card's frame: the bar is the width of the card, not of the card
   * less its padding. The negative margin is the card's own `--pad`, so the two cannot drift
   * apart when either is changed.
   */
  margin: calc(var(--pad) * -1) calc(var(--pad) * -1) 0;
  padding: 1cqw 1.6cqw;
  background: var(--social);
  /*
   * Thicker than the card's frame, and in the bar's own fill colour — so what it buys is red
   * around the icons rather than a line around the bar. Height is content-driven here, so
   * this is also what sets how deep the bar sits.
   */
  border: 0.9cqw solid var(--social);
  /*
   * Rounded on every corner, but the top two are cut to the card's *inner* radius — the
   * outer radius less the frame's thickness. Left at the full figure the bar's corners curve
   * away from the frame it is sitting against, and a crescent of the card shows through at
   * each top corner: the gap that stops it looking like it fits.
   */
  border-radius: calc(var(--radius) - var(--bw)) calc(var(--radius) - var(--bw))
    var(--radius) var(--radius);
}
.socials + .card-inner {
  margin-top: var(--pad);
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
/*
 * Only the ones that lead somewhere lift: a row where an icon without a link answered the
 * pointer the same way would be promising something it cannot do.
 */
a.social {
  cursor: pointer;
  transition: transform 0.16s ease-out;
}
a.social:hover,
a.social:focus-visible {
  transform: translateY(-0.8cqw) scale(1.06);
}
a.social:active {
  transform: translateY(-0.2cqw) scale(1.02);
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
  /* One value each for the inset and the frame, so the bar below can cancel them exactly. */
  --pad: 2cqw;
  --bw: 0.4cqw;
  border-radius: var(--radius, 2.5cqw);
  border: var(--bw) solid var(--social, var(--accent));
  padding: var(--pad);
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
  align-items: stretch;
}
/* Square, and held to it: `align-self` stops the row's stretch from pulling it out of shape. */
.card-photo {
  width: 26%;
  align-self: flex-start;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 1.5cqw;
  flex: none;
}
/*
 * Two pairs to a row on a sheet this wide; one per row would run the card down the page.
 *
 * The rows are spread over the photo's full height rather than stacked at the top of it —
 * on the reference sheet the last value sits level with the bottom of the portrait, which is
 * what makes the card read as one panel instead of as a picture with a caption beside it.
 */
.card-rows {
  flex: 1;
  min-width: 0;
  align-self: stretch;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-auto-rows: min-content;
  align-content: space-between;
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
/*
 * The handwritten line, on the last row of the card's own grid — flush with NAME above it.
 *
 * No `font-style: italic`: Moon Time is already a hand, and there is no italic cut to reach
 * for, so the browser would slant the glyphs itself and skew a script that is drawn on its
 * own slant to begin with.
 *
 * The size is proportional to the sheet, between a floor and a ceiling, the same way the
 * pills are: 4% of the poster's width, capped at the 50px asked for once the sheet is wide
 * enough, and never below 13px. The floor is deliberately low — a signature is the one line
 * on the card that can afford to be small, and a high floor is what leaves it looking pasted
 * on at phone size while everything around it has shrunk.
 *
 * It also sets its own line height: at this size the default leaves the ascenders of a hand
 * like this one crowding the row above.
 */
.card-note {
  grid-column: 1 / -1;
  display: block;
  font-family: 'Moon Time', var(--font-family), cursive;
  font-size: clamp(13px, 4cqw, 50px);
  line-height: 1.1;
  opacity: 0.8;
}

/* ── Name plate ─────────────────────────────────────────────────────────────── */
.plate-img {
  height: auto;
  align-self: center;
  /*
   * A step down from the card, and a bite out of the gap below. The plate is the first thing
   * under the card, so this margin sets where the whole lower half of the sheet begins — the
   * pills, the badges and the tags all follow it down.
   */
  margin-top: 2cqw;
  margin-bottom: -1.5cqw;
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
  /*
   * Wider than it looks: each pill's shadow drops 0.55 into the space below it, so the paper
   * actually showing between two pills is this figure less the shadow.
   */
  gap: 2.4cqw;
  /* Stepped in from the card above — see `listIndent`. */
  margin-left: var(--indent);
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
  /*
   * A rounded rectangle, not a stadium: at 999px the ends turn into half-circles and the pill
   * reads as a tag. The reference draws a soft corner at about a quarter of the pill's height.
   */
  border-radius: 1.4cqw;
  background: var(--pill);
  color: var(--pill-ink);
  /*
   * The site's own face, so the pills read as part of the page rather than as a graphic
   * dropped onto it. Mali also draws Thai, which neither Arabica nor Bebas Neue does, and it
   * ships a real 700 — the bold below is a cut that exists rather than one the browser smears
   * on, which is what the two display faces before it were getting.
   *
   * The size did not have to move with it: measured off the files, Arabica's capitals stand
   * at 0.708 em and Mali's at 0.700, so caps set at the same size come out the same height.
   * What did change is width — see the note on `font-size`.
   */
  font-family: 'Mali', var(--font-family), sans-serif;
  letter-spacing: 0.02em;
  /*
   * Three numbers, and each answers a different screen.
   *
   * The middle one does the work: 2.6% of the poster's width, so the lettering grows and
   * shrinks with the sheet it is printed on rather than with the window — which is what keeps
   * a pill the same shape at every size. 32px caps it, the size asked for, so the type stops
   * growing once the poster is wide enough to carry it. The floor is down at 8px so that the
   * proportional figure — about 9px on a 350px sheet — is the one that governs on a phone
   * rather than being propped up by it.
   *
   * Arabica and Mali set capitals to the same height, but not to the same width: over a real
   * pill's worth of text Mali runs 1.38× wider, so at the size that matched Arabica's height
   * the pills came out noticeably longer. These figures are that height-matched set taken down
   * a step (×0.85), which gives back about half of that width. Taking the whole 0.72 — 23px
   * and 1.88cqw — would hold Arabica's pill lengths exactly, at the cost of lettering that
   * reads as smaller than what was there before.
   */
  font-size: clamp(7px, 2.2cqw, 27px);
  font-weight: 700;
  /*
   * The pills are set in caps on the sheet, so the case is applied here rather than left to
   * whoever types the text — the same line then reads the same whether it was entered as
   * "Height : 205 cm" or "HEIGHT : 205 CM". Thai is unaffected; it has no cases.
   */
  text-transform: uppercase;
  /*
   * Hard-edged and offset, with no blur — a second copy of the pill sitting behind it in a
   * darker shade of its own colour. A blurred shadow lifts the pill off the paper; this one
   * keeps it printed on it, which is what the sheet does.
   */
  box-shadow: 0.55cqw 0.55cqw 0 var(--pill-shadow);
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
  /* The bullet follows the lettering, so the pair always reads as one mark. */
  background: var(--pill-ink);
  opacity: 0.85;
  flex: none;
}

/* ── Trait badges ───────────────────────────────────────────────────────────── */
/*
 * Not a row and not a grid: two badges pushed out to the far edges, and the third dropped
 * into the notch between and below them, riding up over both. The wide gap across the top is
 * as much a part of the arrangement as the overlap underneath — closed up, the three sit in a
 * huddle instead of the triangle the sheet draws.
 *
 * The lift is a negative margin, so it is a share of the column's width and holds its
 * proportion at any size. The badge that comes last paints over the two above it.
 */
.traits {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0;
  /*
   * Its own breathing room on top of the column's gap, above and below. The badges are the
   * one block on the sheet that is pictures rather than lines of type, and set at the same
   * spacing as the pills they read as two more rows of the same list.
   */
  margin: 2.7cqw 0 2.7cqw var(--indent);
}
/*
 * Two badges to a row, so a third wraps to a centred second row — the arrangement on the
 * reference sheet. At a third of the column all three sat in one line instead.
 */
.trait {
  width: 40%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.8cqw;
}
/*
 * The third badge onwards: centred on its own line by the auto margins — `space-between`
 * would otherwise leave a lone badge stranded at the left edge — and lifted into the gap
 * above so its corners meet the two beside it.
 */
.trait:nth-child(n + 3) {
  margin: -10% auto 0;
}
/*
 * No ring and no plate: the badge artwork is uploaded whole — circle, icon and caption
 * already drawn into the file — so anything added here would be a second frame around a
 * picture that has its own. The height follows the file rather than a fixed square, which
 * is what lets it show in full instead of being fitted inside a box.
 */
.trait-disc {
  display: block;
  width: 100%;
}
.trait-disc img {
  display: block;
  width: 100%;
  height: auto;
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
  /* The props lie on top of everything, the figure included. */
  z-index: 4;
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
  a.social,
  a.social:hover,
  a.social:focus-visible,
  a.social:active {
    transition: none;
    transform: none;
  }
}
</style>
