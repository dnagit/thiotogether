<script setup lang="ts">
/**
 * Every wish as a postcard, laid out in a grid.
 *
 * The wall is the party — balloons drifting past, one card at a time behind whichever is
 * tapped. This is the same wishes read the other way: all of them, in order, as the card
 * each sender made. Nothing new is drawn here; it is `WishCard` at column width.
 *
 * Nine at a time, and no polling. Both are for the same reason: a card is a whole SVG with
 * the party artwork, the sender's picture and their photo in it, so a page of them is heavy
 * enough that they have to be asked for rather than poured out — and a list that quietly
 * grew a row at the top while someone was reading would move the card under their eyes.
 */
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { applySeo } from '@/composables/useSeo';
import { useBirthdayWall } from '@/composables/useBirthdayWall';
import WishCard from '@/components/birthday/WishCard.vue';

/** How many more cards each press of the button is worth. */
const PAGE = 9;

const route = useRoute();
const slug = String(route.params.slug || 'birthday');

const { event, wishes, loading, loadError, notFound } = useBirthdayWall(slug, { pollMs: 0 });

const themeColor = computed(() => event.value?.themeColor ?? '#ea480c');

const shown = ref(PAGE);
const cards = computed(() => wishes.value.slice(0, shown.value));
const remaining = computed(() => Math.max(0, wishes.value.length - shown.value));

/**
 * How deep each length of line dips, as a share of the deepest one.
 *
 * A row of identical scallops is a pattern, not a washing line. These are five uneven
 * depths that do not divide into the column counts (1, 2 and 3), so no column ever gets the
 * same depth twice running and the line rises and falls the whole way along.
 *
 * The card hangs from its own peg, so a deeper dip carries its card lower with it — which is
 * where most of the depth in the picture comes from.
 */
const DIPS = [1, 0.6, 0.84, 0.68, 0.92] as const;
const dipOf = (index: number): number => DIPS[index % DIPS.length];

/**
 * One length of line, drawn in a 100 × 150 box and stretched to whatever the column is wide.
 *
 * Both ends stay at 10 however deep the dip, which is what lets neighbouring lengths meet
 * without a step in the join. A quadratic reaches half way to its control point, so the
 * control is set to twice the wanted depth.
 */
function wirePath(index: number): string {
  const depth = 130 * dipOf(index);
  return `M0 10 Q50 ${(2 * depth - 10).toFixed(0)} 100 10`;
}

watch(event, (e) => {
  if (!e) return;
  applySeo({
    title: e.celebrantName ? `คำอวยพรทั้งหมด — ${e.celebrantName}` : `คำอวยพรทั้งหมด — ${e.title}`,
    metaDescription: e.description ?? 'รวมคำอวยพรวันเกิดจากทุกคน',
    ogImage: e.coverImage ?? undefined,
  });
});
</script>

<template>
  <div v-if="loading" class="py-24 text-center text-gray-500 animate-pulse">กำลังโหลดคำอวยพร…</div>

  <div v-else-if="notFound" class="container-site max-w-lg py-24 text-center">
    <div class="mb-3 text-5xl" aria-hidden="true">🔍</div>
    <h1 class="mb-2 text-xl font-bold">ไม่พบงานวันเกิดนี้</h1>
    <p class="text-gray-600">{{ loadError }}</p>
  </div>

  <div v-else class="container-site max-w-6xl py-8 sm:py-12">
    <header class="mb-8 text-center">
      <h1 class="text-2xl font-extrabold sm:text-4xl">คำอวยพรทั้งหมด</h1>
      <p v-if="event?.celebrantName" class="mt-1 text-lg font-semibold" :style="{ color: themeColor }">
        ถึง {{ event.celebrantName }}
      </p>
      <p v-if="wishes.length" class="mt-2 text-gray-700">ทั้งหมด {{ wishes.length }} ใบ</p>

      <RouterLink :to="{ name: 'birthday-wall', params: { slug } }" class="back-link mt-4">
        <span aria-hidden="true">←</span> กลับไปหน้าลูกโป่งลอย
      </RouterLink>
    </header>

    <p v-if="loadError" class="mb-6 text-center text-sm text-red-600" role="alert">{{ loadError }}</p>

    <div v-if="!wishes.length" class="mx-auto max-w-lg py-16 text-center">
      <div class="mb-3 text-5xl" aria-hidden="true">🎈</div>
      <h2 class="mb-2 text-xl font-bold">ยังไม่มีคำอวยพร</h2>
      <p class="mb-6 text-gray-600">มาเป็นคนแรกที่ปล่อยลูกโป่งอวยพรกันเถอะ</p>
      <RouterLink
        :to="{ name: 'birthday-wish', params: { slug } }"
        class="btn-3d write-btn"
        :style="{ '--cta': themeColor }"
      >
        เขียนคำอวยพร
      </RouterLink>
    </div>

    <template v-else>
      <!--
        One column on a phone, two on a large phone, three from a tablet up — the third
        column arrives at 768px rather than Tailwind's `lg`, or a laptop window narrower than
        1024 would show a two-up grid with a card's width of margin either side of it.
      -->
      <ul class="cards grid list-none grid-cols-1 sm:grid-cols-2 md:grid-cols-3" role="list">
        <li
          v-for="(wish, i) in cards"
          :key="wish.id"
          class="hang"
          :style="{ '--dip': dipOf(i) }"
        >
          <!--
            The line, sagging under the card it holds. Stretched with
            `preserveAspectRatio="none"` so one curve fits a column of any width, and the
            stroke told not to stretch with it — otherwise the same squashing that would
            flatten it sideways would thin it out too.

            Two strokes on the one path: a dark cord, and a narrower lit one laid down its
            middle. That is what gives a flat line a round side.
          -->
          <svg class="wire" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true">
            <path
              :d="wirePath(i)"
              fill="none"
              stroke="#6f4d2f"
              stroke-width="3.6"
              stroke-linecap="round"
              vector-effect="non-scaling-stroke"
            />
            <path
              :d="wirePath(i)"
              fill="none"
              stroke="#c49a70"
              stroke-width="1.3"
              stroke-linecap="round"
              vector-effect="non-scaling-stroke"
            />
          </svg>

          <!--
            The peg, over the line and biting the top of the card. Drawn rather than
            imported: it is two rounded halves and a spring, and at this size a file would
            cost a request to say the same thing.
          -->
          <svg class="peg" viewBox="0 0 26 44" aria-hidden="true">
            <rect x="4" y="1" width="18" height="40" rx="4.5" fill="#e3b075" />
            <path d="M13 1h9a4.5 4.5 0 0 1 4.5 4.5v31A4.5 4.5 0 0 1 22 41h-9z" fill="#cf9455" />
            <rect x="12.2" y="1" width="1.6" height="40" fill="#00000018" />
            <rect x="2.5" y="15" width="21" height="3.4" rx="1.7" fill="#cbd0d6" />
            <rect x="2.5" y="15" width="21" height="1.4" rx="0.7" fill="#eef1f4" />
          </svg>

          <div class="pinned-card">
            <WishCard
              :name="wish.name"
              :message="wish.message"
              :balloon-shape="wish.balloonShape"
              :balloon-color="wish.balloonColor"
              :photo-url="wish.photoUrl"
              :framing="wish.photoFraming"
              :background-url="wish.background?.imageUrl"
              :gift-image="wish.gift?.imageUrl"
            />
          </div>
        </li>
      </ul>

      <div v-if="remaining" class="mt-10 text-center">
        <button
          type="button"
          class="btn-3d write-btn"
          :style="{ '--cta': themeColor }"
          @click="shown += PAGE"
        >
          ดูเพิ่มอีก {{ Math.min(PAGE, remaining) }} ใบ
        </button>
        <p class="mt-2 text-sm text-gray-600">เหลืออีก {{ remaining }} ใบ</p>
      </div>

      <div class="mt-12 text-center">
        <RouterLink :to="{ name: 'birthday-wall', params: { slug } }" class="back-link">
          <span aria-hidden="true">←</span> กลับไปหน้าลูกโป่งลอย
        </RouterLink>
      </div>
    </template>
  </div>
</template>

<style scoped>
/*
 * The cards are hung on a line and pegged, which is three pieces per cell: a length of wire
 * across the top, a peg over it, and the card swinging under the peg.
 *
 * The wire is drawn per cell rather than per row, because the number of columns is decided
 * by a media query and a row is not a thing this markup has. Each segment overhangs its cell
 * by half the gap at both ends, so neighbouring segments meet exactly and the row reads as
 * one line — and the two at the ends run out into the container's own padding, which is what
 * makes it look like a line strung across rather than one drawn under each card.
 *
 * That per-cell drawing is also what makes the sag come out right. Each segment dips in the
 * middle, where its own peg is, and returns to the joins at either end — so a row scallops
 * from card to card the way a real line does under the weight hung on it, rather than
 * drooping once across the whole row.
 */
.cards {
  --gap: 1.5rem;
  /* Grows with the page, like the cards it pins: a fixed peg looks like a splinter on a
     desktop card and a plank on a phone one. */
  --peg-h: clamp(40px, 4vw, 58px);
  /* How far the peg reaches down over the card — the bite, not the whole peg. */
  --peg-bite: calc(var(--peg-h) * 0.3);
  /*
   * How deep the deepest length of line dips between one join and the next.
   *
   * Generous on purpose: a dip of a few pixels over a column four hundred wide is a line
   * that looks very slightly crooked rather than one that hangs. This is about a twelfth of
   * the span, which is roughly what a real line does with washing on it.
   */
  --sag: clamp(18px, 2.6vw, 44px);
  /* Row gap is larger: the cards hang, so a row needs the wire's height as well. */
  column-gap: var(--gap);
  row-gap: calc(var(--gap) + 1.25rem);
}

.hang {
  position: relative;
  /*
   * Room above the card for the peg to stand in, less the part that bites it — and this
   * length's own dip as well, since the peg hangs at the bottom of the curve rather than up
   * at the joins. A shallower dip therefore carries its card higher, and the row of them
   * rides up and down with the line.
   */
  padding-top: calc(var(--peg-h) - var(--peg-bite) + var(--sag) * var(--dip, 1));
}
/*
 * The box every length of line is drawn in. Its height is the same for all of them however
 * deep each dips — the depth is in the path, not the box — because the ends sit at a share
 * of the box height, and a box that changed size would move them and break the joins.
 */
.wire {
  position: absolute;
  top: calc(var(--peg-h) * 0.3);
  left: calc(var(--gap) / -2);
  /*
   * Width said outright rather than left to `left` and `right` together: an `<svg>` is a
   * replaced element, so a pair of offsets does not stretch it — it keeps its own size and
   * the second offset is dropped, which drew the line as a 14px stub.
   */
  width: calc(100% + var(--gap));
  height: calc(var(--sag) * 1.15);
  filter: drop-shadow(0 2px 2px rgb(0 0 0 / 22%));
}

.peg {
  position: absolute;
  /* At the bottom of this length's dip, which is where the weight is. */
  top: calc(var(--sag) * var(--dip, 1));
  left: 50%;
  /* The drawing is 26 × 44; this keeps it to those proportions at any height. */
  width: calc(var(--peg-h) * (26 / 44));
  height: var(--peg-h);
  transform: translateX(-50%);
  /* Over both the wire and the card's top edge — that is what "pegged on" looks like. */
  z-index: 2;
  filter: drop-shadow(0 2px 3px rgb(0 0 0 / 25%));
}

/*
 * Hung from the peg rather than sitting square: the pivot is the top centre, where the peg
 * is, so the card swings from the point it is actually held by. Alternating and small — a
 * couple of degrees reads as hanging, more reads as falling off.
 */
.pinned-card {
  transform: rotate(var(--tilt, -1.2deg));
  transform-origin: 50% 0;
}
.hang:nth-child(2n) .pinned-card {
  --tilt: 1.1deg;
}
.hang:nth-child(3n) .pinned-card {
  --tilt: -0.6deg;
}
.hang:nth-child(5n) .pinned-card {
  --tilt: 1.6deg;
}
@media (prefers-reduced-motion: reduce) {
  .pinned-card {
    transform: none;
  }
}

/*
 * The same moulded button as everywhere else on these pages — see `.btn-3d` in `main.css`,
 * which paints it. This only gives it a shape.
 */
.write-btn {
  @apply inline-block rounded-full px-7 py-3 text-center font-semibold text-white transition;
}

/* Text, not a button: this is a way back, not the thing to do on the page. */
.back-link {
  @apply inline-block rounded-full px-4 py-2 text-sm font-semibold text-gray-700 transition;
  background: rgb(255 255 255 / 82%);
  backdrop-filter: blur(6px);
  box-shadow: 0 2px 10px rgb(0 0 0 / 12%);
}
.back-link:hover {
  background: rgb(255 255 255 / 95%);
}
</style>
