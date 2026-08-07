<script setup lang="ts">
/**
 * Balloons drifting up the screen, each opening its message when tapped.
 *
 * Three decisions shape it:
 *
 *  - **Motion is CSS, not JavaScript.** Two nested animations — a rise and a slower sway —
 *    run on the compositor, so a phone showing forty balloons stays smooth and a background
 *    tab costs nothing.
 *  - **Every flight is derived from the wish's id**, so a balloon keeps its lane, speed and
 *    drift across a refresh, and a poll bringing in new wishes does not reshuffle the ones
 *    already in the air.
 *  - **Reduced motion gets a still gallery, not a slower rise.** Someone asking for less
 *    movement is asking not to chase a moving target, so the same balloons are laid out in
 *    a grid with the same popup behind them.
 */
import { computed, ref, watch } from 'vue';
import { useMediaQuery } from '@vueuse/core';
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

const emit = defineEmits<{ 'update:reading': [boolean] }>();

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
 * Flight parameters for one balloon.
 *
 * Lanes are dealt out evenly and only then jittered, because pure randomness clumps — a
 * dozen balloons would leave bald patches and a pile-up. The delay is negative so each
 * animation starts part-way through: the sky opens already full instead of empty for the
 * first twenty seconds.
 */
function flight(wish: Wish, index: number, total: number): Record<string, string> {
  const spread = 88 / Math.max(1, total);
  const duration = 20 + hash(wish.id, 2) * 16;
  return {
    '--lane': `${(6 + index * spread + hash(wish.id, 1) * spread * 0.8).toFixed(2)}%`,
    '--rise-duration': `${duration.toFixed(1)}s`,
    '--rise-delay': `-${(hash(wish.id, 3) * duration).toFixed(1)}s`,
    '--sway-duration': `${(4 + hash(wish.id, 4) * 3).toFixed(1)}s`,
    '--sway': `${(8 + hash(wish.id, 5) * 14).toFixed(0)}px`,
    // Balloons overlap each other consistently instead of flickering over one another.
    'z-index': String(10 + (index % 7)),
  };
}
</script>

<template>
  <div>
    <!-- Still gallery for anyone who asked for reduced motion -->
    <ul v-if="reducedMotion" class="gallery" role="list">
      <li v-for="wish in wishes" :key="wish.id">
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

    <div v-else class="sky" :class="{ 'sky-paused': !!opened }" :style="{ height }">
      <div
        v-for="(wish, index) in wishes"
        :key="wish.id"
        class="lane"
        :style="flight(wish, index, wishes.length)"
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

.lane {
  position: absolute;
  bottom: 0;
  left: var(--lane);
  --balloon-w: clamp(88px, 13vw, 150px);
  width: var(--balloon-w);
  /* Centres the balloon on its lane without spending the transform, which the rise needs. */
  margin-left: calc(var(--balloon-w) / -2);
  animation: rise var(--rise-duration) linear var(--rise-delay) infinite;
  will-change: transform;
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
  /* Starts a full assembly below the floor and leaves well above the ceiling, so neither
     end of the flight pops into view. */
  from {
    transform: translate3d(0, 60vh, 0);
  }
  to {
    transform: translate3d(0, -140vh, 0);
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
  --balloon-w: clamp(110px, 22vw, 160px);
}

</style>
