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
 *  - **Nothing may line up.** A wall of balloons is not a chart, and the arrangement that
 *    packs them best is a lattice, which is exactly what a party wall must not look like.
 *    So an empty sky gets {@link scatterSeats a thrown handful} and a full one gets
 *    {@link laneSeats lanes} of deliberately unequal length, and either way no two balloons
 *    are the same size, upright, or swinging in time.
 *  - **A balloon keeps its seat.** Seats are dealt in the order the wishes were written, so
 *    a poll bringing in a new one appends rather than reshuffling the sky mid-flight, and
 *    everything about a balloon but its position is hashed from the wish's id.
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
    /** Used to build the link a shared card points at. */
    slug?: string;
    /** Passed straight through to the card popup, whose buttons wear it. */
    themeColor?: string | null;
  }>(),
  {
    height: 'calc(100svh - var(--header-h))',
    slug: '',
    themeColor: null,
  },
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

/**
 * Assembly height ÷ balloon width: the balloon (1.04), its string (0.3), the present
 * (0.62 × 0.88) and the name tag (~0.3). Read off `WishBalloon.vue`'s own proportions —
 * resizing any part of it there leaves this number stale, and the wall would space itself
 * for a balloon that is no longer the size it draws.
 *
 * The tag is the one part whose height depends on the wish: a name long enough to wrap
 * takes two lines. This reserves that taller tag for every balloon rather than measuring
 * each one — a short name then sits in a little more sky than it needs, which costs
 * nothing anyone can see, where the other way round two balloons touch.
 */
const ASSEMBLY_RATIO = 2.19;
/**
 * The tightest a lane may be packed, as a multiple of the full balloon width — which is
 * also the least room a balloon is ever left to move about in: 9% of its width to either
 * side, even shoulder to shoulder on a phone.
 */
const GAP_X = 1.18;
/**
 * What a lane reserves per balloon along the path. {@link MIN_GAP_Y} is the part that has
 * to survive; the difference is room to sit off the mark, which is worth more than the
 * balloons it costs — evenly spaced is the other half of what reads as a grid.
 */
const GAP_Y = 1.4;
/** How close two balloons in a lane may ever come, as a multiple of their own heights. */
const MIN_GAP_Y = 1.05;
/**
 * Ceiling on how far a balloon strays from its lane, as a fraction of its width. A quiet
 * wall has lanes wide enough to swing right across, which is not drifting but wandering.
 */
const STRAY_MAX = 0.5;
/** How far a balloon may hang from upright, in degrees. */
const MAX_TILT = 7;
/**
 * How far a balloon rises and falls on its own, as a fraction of its width.
 *
 * The climb itself cannot be given to each balloon separately. A lane shares one speed
 * because that is what holds the spacing dealt out along it, and a scattered sky shares one
 * across the whole sky for the same reason — so on a phone, where two or three columns is
 * all the width affords, the sky has two or three speeds in it and often just the one. That
 * is what makes it read as a sheet sliding upwards rather than as balloons.
 *
 * This is the part that can differ: a slow bob at each balloon's own sway period and phase,
 * riding on top of the shared climb. Every pair is already a full assembly height apart
 * along the path (or clear of each other sideways), and two bobs can close at most a sixth
 * of that between them, so no arrangement this breaks was safe to begin with.
 */
const BOB = 0.08;
/**
 * What the bob costs the spacing, in assembly heights: two neighbours bobbing towards each
 * other close twice its amplitude. Every gap along the path is widened by this, so the
 * arrangements below stay exactly as clear as they were before the balloons could move
 * independently — the room is bought up front rather than hoped for.
 */
const BOB_CLEAR = (2 * BOB) / ASSEMBLY_RATIO;
/**
 * Balloons are drawn between this and full size inside their slot.
 *
 * Nothing but variety: a sky of one size, evenly spaced, reads as a grid however carefully
 * the spacing is jittered — the eye finds the repeat. Since a slot is reserved at full size,
 * every balloon drawn smaller than its slot only adds clearance, and the room it frees is
 * handed back as drift (see {@link flight}).
 */
const MIN_SCALE = 0.76;
/** Pixels a second. Constant across sizes, so a crowded sky does not also become a fast one. */
const SPEED = 26;
/** How far the flight path may outgrow the window before shrinking the balloons instead. */
const MAX_TRAVEL = 3;
/**
 * Seconds for one lap. The last resort once the balloons are as small as they may go.
 *
 * Moves with {@link SPEED}, and has to: the two are only ever multiplied together, as the
 * longest flight path a balloon may be given. Drop the speed alone and that path shortens
 * with it, which is not a slower sky but a more crowded one — the spacing has less room to
 * fit in, so the balloons come out smaller. Their product is what the layout is really made
 * of, so it is held at roughly 5,000px while the speed changes underneath it.
 */
const MAX_CYCLE = 195;
/** Small enough to fit a crowd, big enough to still read the tag and hit with a thumb. */
const MIN_BALLOON_W = 80;
/** Ceiling for the same knob turned the other way, on a wall with room to spare. */
const MAX_BALLOON_W = 180;

/** Beyond this many, scattering is neither affordable to compute nor possible to see. */
const SCATTER_MAX = 90;
/** Share of the sky a scattered arrangement may cover before it stops finding room. */
const SCATTER_DENSITY = 0.42;
/** Tries per balloon when scattering. Enough to find a gap; few enough to stay instant. */
const SCATTER_TRIES = 28;

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

/** Where one balloon sits, and how it behaves once it is there. */
interface Seat {
  /** Centre of the balloon, in pixels across the sky. */
  x: number;
  /** How far along the loop it starts, 0–1. */
  phase: number;
  /** Fraction of the full balloon width it is drawn at. */
  scale: number;
  /** Half the width of its drift, in pixels. */
  drift: number;
  /** Resting angle, in degrees. */
  tilt: number;
  /** Seconds for one lap. */
  duration: number;
}

/** Half the balloon's own height, in widths — its `aspect-ratio` is 100/104. */
const BALLOON_HALF = 0.52;
/**
 * How far the balloon sits above what it swings around. `transform-origin` is left at the
 * default, so the tilt pivots about the middle of the whole assembly; a bigger present
 * lowers that pivot and swings the balloon further for the same angle.
 */
const PIVOT_DROP = ASSEMBLY_RATIO / 2 - BALLOON_HALF;

/**
 * The parts of a balloon that come from the wish rather than from where it was put.
 *
 * Drawing every balloon at the size of its slot is what makes a wall look printed rather
 * than floating, so each takes a hashed share of it and hangs at its own angle. A tilt
 * carries the balloon sideways as well as turning it, and that has to be paid for out of
 * the same room the drift comes from.
 */
function profile(wish: Wish, w: number): { scale: number; drawn: number; tilt: number; lean: number } {
  const scale = MIN_SCALE + hash(wish.id, 8) * (1 - MIN_SCALE);
  const drawn = w * scale;
  const tilt = MAX_TILT * (hash(wish.id, 10) * 2 - 1);
  // The sway's own ±1.5° is in the sum: this is the widest the balloon ever leans.
  const lean = PIVOT_DROP * drawn * Math.sin(((Math.abs(tilt) + 1.5) * Math.PI) / 180);
  return { scale, drawn, tilt, lean };
}

/**
 * How many balloons each lane carries: as near equal as the arithmetic allows.
 *
 * Density is the one thing that must stay even across the width. A lane holding twice its
 * neighbour's share does not read as informality, it reads as a sky that is leaning, and no
 * amount of variety elsewhere argues with it — which is why the irregularity is spent on
 * {@link laneOffsets rhythm} instead, where it costs nothing to look at.
 *
 * The lanes that take the remainder are rotated rather than being the first few, so the
 * extra balloon is not always on the same side.
 */
function laneCounts(total: number, columns: number): number[] {
  const spare = total % columns;
  const shift = Math.floor(hash(columns, 34) * columns);
  return Array.from(
    { length: columns },
    (_, col) => Math.floor(total / columns) + ((col + shift) % columns < spare ? 1 : 0),
  );
}

/**
 * Where each balloon in a lane sits along the loop, as a distance from the lane's start.
 *
 * Not evenly spaced: the same spacing in every lane is what draws the diagonals across a
 * crowded sky, because the eye joins up the repeat. Each lane divides the path into gaps of
 * its own instead, so no two lanes keep the same rhythm and nothing stays lined up.
 *
 * Every gap starts at `minGap` and the *spare* room is what gets shared out unevenly, so
 * the clearance between two balloons is guaranteed however lopsided the weights come out.
 * That spare room is what {@link GAP_Y} reserves by asking for a third more than a lane
 * strictly needs.
 */
function laneOffsets(col: number, count: number, travel: number, minGap: number): number[] {
  const weights = Array.from({ length: count }, (_, row) => 0.55 + hash(`${col}:${row}`, 33));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  // On a wall too full to give every gap its minimum, the floor drops to whatever the lane
  // does have: the gaps come out equal, which is the most room an overloaded lane can offer
  // and exactly what an even split would have done.
  const base = Math.min(minGap, travel / count);
  const slack = travel - count * base;

  const offsets: number[] = [];
  let along = 0;
  for (const weight of weights) {
    offsets.push(along);
    along += base + (slack * weight) / total;
  }
  return offsets;
}

/**
 * Balloons dealt into lanes: the dense arrangement.
 *
 * Every balloon in a lane shares a speed, so the spacing dealt out here holds forever, and
 * that is what lets a crowded sky stay legible. It is also what makes it a lattice, which
 * is why {@link scatterSeats} is tried first whenever there is room for it, and why what
 * irregularity can be afforded — uneven rhythm, size, drift, tilt — is spent here.
 */
function laneSeats(wishes: Wish[], w: number, width: number, columns: number, travel: number): Seat[] {
  const phaseStep = stride(columns);
  const pitch = width / columns;
  const assembly = w * ASSEMBLY_RATIO;
  const counts = laneCounts(wishes.length, columns);
  const offsets = counts.map((count, col) =>
    laneOffsets(col, count, travel, assembly * (MIN_GAP_Y + BOB_CLEAR)),
  );

  // Dealt round the lanes one at a time, so consecutive wishes land far apart and every
  // lane fills at the same rate.
  const place: { col: number; row: number }[] = [];
  const dealt = counts.map(() => 0);
  for (let seat = 0, col = 0; seat < wishes.length; col = (col + 1) % columns) {
    if (dealt[col] >= counts[col]) continue;
    place.push({ col, row: dealt[col]++ });
    seat++;
  }

  return wishes.map((wish, seat) => {
    const { col, row } = place[seat];
    // A lane's room is measured against the slot, not the balloon in it, so the drawn size
    // is not needed here — only the share of the slot it gives back.
    const { scale, tilt, lean } = profile(wish, w);

    // Half of whatever the lane has spare once this balloon and a worst-case neighbour are
    // standing in it. Two balloons each given half of a gap measured against something no
    // smaller than the other can never close it, so this needs no lookup at the neighbour.
    const freedom = Math.min(Math.max(0, pitch - (w * (scale + 1)) / 2) / 2, w * STRAY_MAX);

    return {
      x: pitch * (col + 0.5) + freedom * 0.45 * (hash(wish.id, 1) * 2 - 1),
      phase: wrap(((col * phaseStep) % columns) / columns + offsets[col][row] / travel),
      scale,
      drift: Math.max(0, freedom * 0.55 - lean),
      tilt,
      // One speed per lane, and a different one per lane: it is the only thing keeping the
      // columns from marching in step, and within a lane it must not vary at all.
      duration: travel / (SPEED * (0.86 + hash(col, 6) * 0.28)),
    };
  });
}

/**
 * Balloons thrown at the sky rather than dealt into it: the arrangement that looks like
 * balloons.
 *
 * Each one takes the best of {@link SCATTER_TRIES} hashed guesses — the position furthest
 * from everything already placed — which fills the sky evenly without ever lining anything
 * up. Two balloons clear each other if they miss on *either* axis, so the score is the
 * better of the two separations, and a whole arrangement is only accepted once every pair
 * reaches 1.
 *
 * The catch, and the reason lanes still exist: a scattered cloud only stays clear if it
 * rises as one, so every balloon here shares a speed. That is no loss — helium does not
 * sort itself by column — but it does mean the arrangement cannot be repaired later by
 * anything drifting apart, so it has to be right when it is made.
 */
function scatterSeats(
  wishes: Wish[],
  w: number,
  width: number,
  travel: number,
  round: number,
): Seat[] | null {
  const duration = travel / SPEED;
  const placed: (Seat & { drawn: number; height: number })[] = [];

  for (const wish of wishes) {
    const { scale, drawn, tilt, lean } = profile(wish, w);
    const drift = Math.max(0, w * 0.12 - lean);
    const height = drawn * ASSEMBLY_RATIO;
    // Kept a full half-balloon in from either side, drift and lean included, so nothing is
    // ever half off the edge of the sky.
    const inset = drawn / 2 + drift + lean;
    const span = Math.max(0, width - inset * 2);

    let best: { x: number; phase: number; score: number } | null = null;
    for (let attempt = 0; attempt < SCATTER_TRIES; attempt++) {
      // A fresh set of guesses each round: retrying the same ones in a longer sky only
      // re-finds the same dead end, since what blocks a guess is usually its neighbour
      // sideways and lengthening the path does not move that.
      const salt = 20 + round * 128 + attempt * 2;
      const x = inset + hash(wish.id, salt) * span;
      const phase = hash(wish.id, salt + 1);
      let score = Infinity;
      for (const other of placed) {
        const apart = Math.abs(x - other.x) / ((drawn + other.drawn) / 2 + drift + other.drift);
        const along = Math.abs(phase - other.phase);
        const gap = (Math.min(along, 1 - along) * travel) / ((height + other.height) / 2);
        score = Math.min(score, Math.max(apart, gap));
        if (score <= (best?.score ?? 0)) break;
      }
      if (!best || score > best.score) best = { x, phase, score };
    }

    if (!best || best.score < 1 + BOB_CLEAR) return null;
    placed.push({ x: best.x, phase: best.phase, scale, drift, tilt, duration, drawn, height });
  }

  return placed;
}

/**
 * How to fit `n` balloons into the measured sky without them piling on top of each other —
 * and, just as much, without them landing in rows.
 *
 * The sizing below works in lanes, because lanes are what a hard capacity question can be
 * answered in. What comes out of it is a size and a length of flight path; the balloons are
 * then {@link scatterSeats scattered} across that if the sky is empty enough to take a
 * scattering, and only {@link laneSeats dealt into the lanes} if it is not.
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
  const wishes = seated.value;
  const total = Math.max(1, wishes.length);
  const width = skyWidth.value || (typeof window === 'undefined' ? 1024 : window.innerWidth);
  const height = skyHeight.value || (typeof window === 'undefined' ? 720 : window.innerHeight);
  // The responsive size crowding starts from — and, when there is more width than there are
  // wishes to fill it, a balloon grown to take up some of the slack rather than leave it.
  /*
   * The 112 is the phone's floor and only ever applies there: anything wider than about
   * 860px already clears it on `width * 0.13` alone, so a desktop is untouched by it. A
   * phone is where the balloon has to carry a present and a readable name in a third of
   * the width, which is the one place proportion has to give way to legibility.
   */
  const maxW = Math.min(
    MAX_BALLOON_W,
    Math.max(
      Math.min(150, Math.max(112, width * 0.13)),
      Math.min(width / total / GAP_X, height * 0.28),
    ),
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

  /*
   * Scattering needs more room than lanes do — a lattice packs to nearly its own area,
   * where thrown balloons stop finding gaps at about {@link SCATTER_DENSITY} of theirs. It
   * is bought the same way the lanes buy clearance, by lengthening the path, and only if
   * the ceiling allows; a wall too full for that keeps its lanes.
   */
  let seats: Seat[] | null = null;
  if (total <= SCATTER_MAX) {
    const area = wishes.reduce((sum, wish) => {
      const { drawn } = profile(wish, w);
      return sum + drawn * drawn * ASSEMBLY_RATIO;
    }, 0);
    // Never more than half again the lane arrangement's path: past that, the balloons a
    // scattering costs are worth more than the scattering.
    const ceiling = Math.min(
      Math.max(height + assembly * 2, height * MAX_TRAVEL, SPEED * MAX_CYCLE),
      travel * 1.5,
    );
    let room = Math.max(travel, area / SCATTER_DENSITY / width);
    for (let round = 0; !seats && room <= ceiling; round++, room *= 1.12) {
      seats = scatterSeats(wishes, w, width, room, round);
      if (seats) travel = room;
    }
  }
  seats ??= laneSeats(wishes, w, width, columns, travel);

  return {
    w,
    travel,
    seats,
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
 * One seat, as the CSS custom properties the animation reads.
 *
 * Everything that decides where a balloon may be has already happened in {@link layout};
 * what is left here is the sway, which is bounded by the drift its seat was given and is
 * otherwise the balloon's own — a slow swing, at its own width, starting wherever in the
 * cycle its id says.
 */
function flight(wish: Wish, seat: number): Record<string, string> {
  const { w, seats } = layout.value;
  const { x, phase, scale, drift, tilt, duration } = seats[seat];

  return {
    '--balloon-w': `${(w * scale).toFixed(0)}px`,
    '--lane': `${x.toFixed(1)}px`,
    '--rise-duration': `${duration.toFixed(1)}s`,
    // Negative, so the sky opens already full rather than empty for the first half minute.
    '--rise-delay': `-${(phase * duration).toFixed(1)}s`,
    // Slow: at a few seconds a swing reads as a jiggle, and a sky of them as one machine.
    // Over a quarter of a minute it reads as a balloon finding its own way up.
    '--sway-duration': `${(9 + hash(wish.id, 4) * 9).toFixed(1)}s`,
    // Without a delay every balloon starts at the same end of its swing, and the whole sky
    // leans one way together for the first few seconds.
    '--sway-delay': `-${(hash(wish.id, 11) * 18).toFixed(1)}s`,
    '--sway': `${drift.toFixed(1)}px`,
    // Rise and fall of its own, on top of the shared climb — see {@link BOB}. Its period is
    // deliberately not the sway's: on one track the two would compose into a single diagonal
    // slide, which is a balloon on rails rather than a balloon.
    '--bob': `${(w * scale * BOB).toFixed(1)}px`,
    '--bob-duration': `${(6 + hash(wish.id, 12) * 7).toFixed(1)}s`,
    '--bob-delay': `-${(hash(wish.id, 13) * 13).toFixed(1)}s`,
    '--tilt': `${tilt.toFixed(1)}deg`,
    // Layered by size, so the small ones sit behind: the same cue as drawing them small.
    'z-index': String(10 + Math.round(((scale - MIN_SCALE) / (1 - MIN_SCALE)) * 6)),
  };
}

/** Into 0–1, for phases that a negative jitter can push off either end. */
function wrap(value: number): number {
  return ((value % 1) + 1) % 1;
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
      :theme-color="themeColor"
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

/* `--travel-start` and `--travel-end` are measured in JS and set on `.sky`; everything
   per-balloon, `--balloon-w` included, is set on the lane by `flight()`. */
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
  animation:
    sway var(--sway-duration) ease-in-out var(--sway-delay) infinite alternate,
    bob var(--bob-duration) ease-in-out var(--bob-delay) infinite alternate;
}

/* Hovering a balloon holds it still, so it can be read and clicked. */
.lane:hover,
.lane:hover .sway {
  animation-play-state: paused;
}
/*
 * Tabbing to one does the same — but `:focus-visible`, not `:focus-within`, and in a rule of
 * its own.
 *
 * Closing the card returns focus to the balloon that opened it, as it should. Under
 * `:focus-within` that balloon then stayed frozen for good while the rest of the sky carried
 * on: it was still focused, and nothing was ever going to take that focus away. Restored
 * focus after a click is not `:focus-visible`, so only a visitor who arrived by keyboard —
 * the one who needs the balloon to hold still — holds it now.
 *
 * Separate rule because `:has()` is the only way to ask this of the lane, and a browser that
 * does not know it drops the whole selector list: kept together, the hover pause above would
 * have gone with it.
 */
.lane:has(:focus-visible),
.lane:has(:focus-visible) .sway {
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
/* The swing is around `--tilt`, the angle this balloon hangs at when still — a sky of
   perfectly upright balloons is the other half of what reads as a grid. */
@keyframes sway {
  from {
    transform: translateX(calc(var(--sway) * -1)) rotate(calc(var(--tilt) - 1.5deg));
  }
  to {
    transform: translateX(var(--sway)) rotate(calc(var(--tilt) + 1.5deg));
  }
}

/* The `translate` property rather than a `transform`, so this rides on the same element as
   the swing without the two having to share one keyframe track — each keeps its own period,
   and `translate` is applied before `transform` either way. */
@keyframes bob {
  from {
    translate: 0 calc(var(--bob) * -1);
  }
  to {
    translate: 0 var(--bob);
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
