<script setup lang="ts">
/**
 * Balloons drifting up the screen, each opening its message when tapped.
 *
 * Four decisions shape it:
 *
 *  - **Motion is CSS, not JavaScript.** Two nested animations — a rise and a slower sway —
 *    run on the compositor, so a phone showing forty balloons stays smooth and a background
 *    tab costs nothing.
 *  - **The sky is measured, and the balloons are fitted to it.** See {@link layout}: three
 *    wishes are spread across the whole width at a size worth looking at, and three hundred
 *    queue up the flight path rather than squeezing in beside each other. The sky is only so
 *    wide, but it is arbitrarily tall.
 *  - **A balloon keeps its seat.** Seats are dealt in the order the wishes were written, so
 *    a poll bringing in a new one appends rather than reshuffling the sky mid-flight, and
 *    the drift and speed within a seat are hashed from the wish's id.
 *  - **Reduced motion gets a still gallery, not a slower rise.** Someone asking for less
 *    movement is asking not to chase a moving target, so the same balloons are laid out in
 *    a grid with the same popup behind them.
 */
import { computed, ref, watch } from 'vue';
import { useElementSize, useMediaQuery } from '@vueuse/core';
import { useRoute, useRouter } from 'vue-router';
import WishBalloon from './WishBalloon.vue';
import WishCardDialog from './WishCardDialog.vue';
import type { Wish } from '@/api/birthday';

const props = withDefaults(
  defineProps<{
    wishes: Wish[];
    /** CSS height for the flight window. Full screen on the wall page, shorter in a block. */
    height?: string;
    /** Printed on the card, and used to build the link a shared card points at. */
    slug?: string;
    eventTitle?: string | null;
    celebrantName?: string | null;
  }>(),
  { height: 'calc(100svh - var(--header-h))', slug: '', eventTitle: null, celebrantName: null },
);

const emit = defineEmits<{
  'update:reading': [boolean];
  /** True once the wall holds more balloons than the window shows at one time. */
  'update:crowded': [boolean];
}>();

const route = useRoute();
const router = useRouter();

const opened = ref<Wish | null>(null);
// Reported outwards so the owner's poll can hold off: refreshing the list under someone
// who is part-way through a message would swap the balloon they are reading.
watch(opened, (wish) => emit('update:reading', !!wish));

const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

/**
 * A shared card has to reopen on the recipient's screen, so the open card is mirrored into
 * `?wish=<id>`.
 *
 * `replace` rather than `push`: a visitor browsing a wall opens a dozen of these, and each
 * one would otherwise become a history entry to click back through.
 */
function open(wish: Wish): void {
  opened.value = wish;
  void router.replace({ query: { ...route.query, wish: String(wish.id) } });
}

function close(): void {
  opened.value = null;
  const { wish, ...rest } = route.query;
  void wish;
  void router.replace({ query: rest });
}

// Runs whenever the list arrives or changes, so a link opens its card as soon as the wish
// it names has loaded — including on a cold page load, where the query is read first.
watch(
  () => [props.wishes, route.query.wish] as const,
  ([wishes, id]) => {
    if (!id || opened.value) return;
    const match = wishes.find((w) => String(w.id) === String(id));
    if (match) opened.value = match;
  },
  { immediate: true },
);

const shareUrl = computed(() => {
  if (typeof window === 'undefined' || !opened.value) return '';
  const url = new URL(props.slug ? `/birthday/${props.slug}` : route.path, window.location.origin);
  url.searchParams.set('wish', String(opened.value.id));
  return url.toString();
});

/**
 * A stable 0–1 value per wish. Ids may be numbers or strings depending on how the event is
 * stored, so they are hashed as text either way.
 */
function hash(id: Wish['id'], salt: number): number {
  const text = `${id}:${salt}`;
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return ((value >>> 0) % 10000) / 10000;
}

/**
 * Seats, dealt oldest first.
 *
 * The API hands back newest first, so seating on the raw index would push every balloon one
 * lane sideways each time a wish arrives — on a party screen polling every thirty seconds,
 * the whole sky would twitch. Oldest first means a new wish takes the next free seat and
 * leaves the balloons already in the air where they are.
 */
const seated = computed(() => {
  const list = props.wishes;
  const dated = list.every((w) => w.createdAt && !Number.isNaN(Date.parse(w.createdAt)));
  return dated
    ? [...list].sort((a, b) => Date.parse(a.createdAt!) - Date.parse(b.createdAt!))
    : [...list].reverse();
});

const sky = ref<HTMLElement | null>(null);
const { width: skyWidth, height: skyHeight } = useElementSize(sky);

/** Assembly height ÷ balloon width: the balloon, its string, the present and the name tag. */
const ASSEMBLY_RATIO = 1.9;
/**
 * Clear space demanded around a balloon, as a multiple of its width. Sideways this has to
 * cover two neighbours swaying towards each other, so it is twice {@link SWAY_MAX}.
 */
const GAP_X = 1.18;
const GAP_Y = 1.18;
/** Widest drift to either side, as a fraction of the balloon's width. */
const SWAY_MAX = 0.09;
/** Pixels a second. Constant across sizes, so a crowded sky does not also become a fast one. */
const SPEED = 46;
/** How far the flight path may outgrow the window before shrinking the balloons instead. */
const MAX_TRAVEL = 3;
/** Seconds for one lap. The last resort once the balloons are as small as they may go. */
const MAX_CYCLE = 110;
/** Small enough to fit a crowd, big enough to still read the tag and hit with a thumb. */
const MIN_BALLOON_W = 64;
/** Ceiling for the same knob turned the other way, on a wall with room to spare. */
const MAX_BALLOON_W = 180;

/**
 * A step that visits every column exactly once, for spreading the columns' starting heights
 * evenly over the flight path.
 *
 * Giving column `c` a start of `c / columns` would work but sends the balloons up in a
 * staircase. Any step coprime with the column count covers the same ground in a scattered
 * order; two thirds along is far from both ends, so the search starts there.
 */
function stride(columns: number): number {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  for (let step = Math.max(1, Math.round(columns * 0.618)); step < columns; step++) {
    if (gcd(step, columns) === 1) return step;
  }
  return 1;
}

/**
 * How to fit `n` balloons into the measured sky without them piling on top of each other —
 * and, just as much, without a handful of them huddling in one corner of it.
 *
 * Three knobs, spent in that order:
 *
 *  1. **Columns.** Only as many as fit at full size, and never more than there are wishes:
 *     five balloons take five columns spread over the whole width, not the leftmost five of
 *     twelve. The width is fixed, so this is the knob that runs out first.
 *  2. **Time.** Balloons sharing a column are spaced along the flight path, which may run up
 *     to {@link MAX_TRAVEL} windows long. Past one window not everyone is on screen at once;
 *     they cycle through instead, which is the trade a wall of two hundred wishes has to
 *     make somewhere.
 *  3. **Size.** Cheaper than more waiting, so it is spent before the path grows further:
 *     a smaller balloon buys more columns and a shorter assembly at once. Only with the
 *     balloons already at {@link MIN_BALLOON_W} does the path stretch on towards a
 *     {@link MAX_CYCLE}-second lap.
 *
 * The search walks sizes downwards and stops at the largest one that clears the gaps, so a
 * quiet wall keeps big balloons and only a busy one pays. Past a few hundred wishes on a
 * phone every knob is spent and the balloons do finally overlap — by then there is no
 * arrangement of that many that does not.
 */
const layout = computed(() => {
  const total = Math.max(1, seated.value.length);
  const width = skyWidth.value || (typeof window === 'undefined' ? 1024 : window.innerWidth);
  const height = skyHeight.value || (typeof window === 'undefined' ? 720 : window.innerHeight);
  // The responsive size crowding starts from — and, when there is more width than there are
  // wishes to fill it, a balloon grown to take up some of the slack rather than leave it.
  const maxW = Math.min(
    MAX_BALLOON_W,
    Math.max(Math.min(150, Math.max(88, width * 0.13)), Math.min(width / total / GAP_X, height * 0.28)),
  );

  let w = maxW;
  let columns = 1;
  let perColumn = total;
  let travel = height;
  let fits = false;

  for (w = maxW; ; w -= 4) {
    // Capped at the number of wishes, so a quiet wall spreads over the full width instead
    // of stacking into the first few columns and leaving the rest of the sky bare.
    columns = Math.min(total, Math.max(1, Math.floor(width / (w * GAP_X))));
    perColumn = Math.max(1, Math.ceil(total / columns));
    const assembly = w * ASSEMBLY_RATIO;
    // Shortest path that still hides both ends of the flight off screen.
    const shortest = height + assembly * 2;
    const wanted = perColumn * assembly * GAP_Y;
    const ceiling = Math.max(shortest, height * MAX_TRAVEL);
    fits = wanted <= ceiling;
    travel = Math.max(shortest, Math.min(wanted, ceiling));
    if (fits || w - 4 < MIN_BALLOON_W) break;
  }

  const assembly = w * ASSEMBLY_RATIO;
  // Out of columns and out of sizes: buy the rest of the clearance with patience.
  if (!fits) travel = Math.max(travel, Math.min(perColumn * assembly * GAP_Y, SPEED * MAX_CYCLE));
  return {
    w,
    width,
    columns,
    perColumn,
    travel,
    phaseStep: stride(columns),
    /** The path outgrew one crossing, so the sky is showing a slice at a time. */
    cycling: travel > height + assembly * 2 + 1,
    // Anything the path has over the shortest crossing is queued below the floor, so a
    // balloon leaving the top is already a long way from coming back.
    start: travel - height - assembly,
    end: -(height + assembly),
  };
});

/** Past this many, per-balloon compositor hints cost more than they buy. */
const dense = computed(() => seated.value.length > 60);

watch(
  () => !reducedMotion.value && layout.value.cycling,
  (cycling) => emit('update:crowded', cycling),
  { immediate: true },
);

/**
 * Flight parameters for one balloon.
 *
 * Everything that keeps balloons apart — the column, the phase along the path, the shared
 * per-column speed — comes from the seat. Everything that stops them looking stamped out —
 * the drift within the column, the sway — is hashed from the id, and is bounded so it can
 * never reach into a neighbour's space.
 */
function flight(wish: Wish, seat: number): Record<string, string> {
  const { w, width, columns, perColumn, travel, phaseStep } = layout.value;
  const col = seat % columns;
  const row = Math.floor(seat / columns);

  const colWidth = 100 / columns;
  // Whatever the column has spare after the balloon and its clearance, half either side —
  // but never more than a third of a balloon. On a quiet wall the columns are wide, and
  // unbounded drift there would let two balloons huddle together and undo the spreading.
  const slack = Math.min(
    Math.max(0, colWidth - ((w * GAP_X) / width) * 100) / 2,
    ((w * 0.33) / width) * 100,
  );
  const lane = colWidth * (col + 0.5) + (hash(wish.id, 1) * 2 - 1) * slack;

  // One speed per column, not per balloon: balloons sharing a lane must hold their spacing,
  // and it is the difference between columns that keeps the sky from marching in step.
  const duration = travel / (SPEED * (0.86 + hash(col, 6) * 0.28));
  // Negative, so the sky opens already full rather than empty for the first half minute.
  // Evenly over the path in both directions: down the column by the row, and across the
  // columns by the stride, so five wishes are five heights rather than five in a row.
  const phase = (row / perColumn + ((col * phaseStep) % columns) / columns) % 1;

  return {
    '--lane': `${lane.toFixed(2)}%`,
    '--rise-duration': `${duration.toFixed(1)}s`,
    '--rise-delay': `-${(phase * duration).toFixed(1)}s`,
    '--sway-duration': `${(4 + hash(wish.id, 4) * 3).toFixed(1)}s`,
    '--sway': `${(w * SWAY_MAX * (0.45 + hash(wish.id, 5) * 0.55)).toFixed(0)}px`,
    // Balloons overlap each other consistently instead of flickering over one another.
    'z-index': String(10 + (seat % 7)),
  };
}

/** The still gallery has the whole page to grow down, so it only ever trims the size. */
const galleryWidth = computed(() => {
  const n = seated.value.length;
  if (n > 60) return '92px';
  if (n > 24) return 'clamp(96px, 16vw, 128px)';
  return 'clamp(110px, 22vw, 160px)';
});
</script>

<template>
  <div>
    <!-- Still gallery for anyone who asked for reduced motion -->
    <ul
      v-if="reducedMotion"
      class="gallery"
      role="list"
      :style="{ '--balloon-w': galleryWidth }"
    >
      <li v-for="wish in seated" :key="wish.id">
        <WishBalloon
          interactive
          :shape="wish.balloonShape"
          :color="wish.balloonColor"
          :photo-url="wish.photoUrl"
          :framing="wish.photoFraming"
          :gift-image="wish.gift?.imageUrl"
          :name="wish.name"
          @open="open(wish)"
        />
      </li>
    </ul>

    <div
      v-else
      ref="sky"
      class="sky"
      :class="{ 'sky-paused': !!opened, 'sky-dense': dense }"
      :style="{
        height,
        '--balloon-w': `${layout.w.toFixed(0)}px`,
        '--travel-start': `${layout.start.toFixed(0)}px`,
        '--travel-end': `${layout.end.toFixed(0)}px`,
      }"
    >
      <div
        v-for="(wish, seat) in seated"
        :key="wish.id"
        class="lane"
        :style="flight(wish, seat)"
      >
        <div class="sway">
          <WishBalloon
            interactive
            :shape="wish.balloonShape"
            :color="wish.balloonColor"
            :photo-url="wish.photoUrl"
            :framing="wish.photoFraming"
            :gift-image="wish.gift?.imageUrl"
            :name="wish.name"
            @open="open(wish)"
          />
        </div>
      </div>
    </div>

    <!-- The card behind a balloon -->
    <WishCardDialog
      :wish="opened"
      :event-title="eventTitle"
      :celebrant-name="celebrantName"
      :share-url="shareUrl"
      @close="close"
    />
  </div>
</template>

<style scoped>
/*
 * The window the balloons pass through. The default height uses `svh` rather than `vh`:
 * on mobile the browser chrome makes `vh` taller than what is visible, which would park
 * the bottom of the flight path under the address bar.
 */
.sky {
  position: relative;
  min-height: 420px;
  overflow: hidden;
}

/* `--balloon-w`, `--travel-start` and `--travel-end` are measured in JS and set on `.sky`. */
.lane {
  position: absolute;
  bottom: 0;
  left: var(--lane);
  width: var(--balloon-w);
  /* Centres the balloon on its lane without spending the transform, which the rise needs. */
  margin-left: calc(var(--balloon-w) / -2);
  animation: rise var(--rise-duration) linear var(--rise-delay) infinite;
  will-change: transform;
}
/* A hint per element is cheap at forty and expensive at four hundred; the compositor
   promotes an animating transform on its own either way. */
.sky-dense .lane {
  will-change: auto;
}
.sway {
  animation: sway var(--sway-duration) ease-in-out infinite alternate;
}

/* Hovering or tabbing to a balloon holds it still, so it can be read and clicked. */
.lane:hover,
.lane:focus-within,
.lane:hover .sway,
.lane:focus-within .sway {
  animation-play-state: paused;
}
/* Everything stops while a message is open — a balloon must not drift away mid-read. */
.sky-paused .lane,
.sky-paused .sway {
  animation-play-state: paused;
}

@keyframes rise {
  /* Starts a full assembly below the floor and leaves a full assembly above the ceiling, so
     neither end of the flight pops into view. On a crowded wall the start reaches further
     down still — that queue below the floor is what keeps the balloons on screen apart. */
  from {
    transform: translate3d(0, var(--travel-start), 0);
  }
  to {
    transform: translate3d(0, var(--travel-end), 0);
  }
}
@keyframes sway {
  from {
    transform: translateX(calc(var(--sway) * -1)) rotate(-2deg);
  }
  to {
    transform: translateX(var(--sway)) rotate(2deg);
  }
}

.gallery {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: clamp(1rem, 3vw, 2rem);
  padding-block: 2rem;
}

</style>
