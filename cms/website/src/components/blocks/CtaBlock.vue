<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';

interface CtaButton {
  label?: string;
  url?: string;
  image?: string;
  /** Swapped in while the pointer is over the button; falls back to `image` when unset. */
  hoverImage?: string;
}

const props = defineProps<{
  title?: string;
  text?: string;
  buttons?: CtaButton[];
  /** Desktop columns. Arrives as a string from the select field in the page builder. */
  perRow?: number | string;
  /** Space above and below the block. Blank keeps the 2rem this block has always carried. */
  marginTop?: string | number;
  marginBottom?: string | number;
  /** Pre-list props: pages saved before this block took multiple buttons still carry these. */
  buttonLabel?: string;
  buttonUrl?: string;
}>();

/**
 * A bare number is treated as px; anything else passes through as authored CSS — the same rule the
 * page builder's section-level offsets use, so one habit covers both.
 */
function cssLength(raw: string | number | undefined, fallback: string): string {
  const value = String(raw ?? '').trim();
  if (!value) return fallback;
  return /^-?\d*\.?\d+$/.test(value) ? `${value}px` : value;
}

/**
 * Default pull-up: how far this section climbs over the banner above it.
 *
 * The figure is `vw` because the section it overlaps is width-driven — a banner's height is its
 * own width over a fixed aspect ratio (2.1, see `ComponentRenderer`) — so an overlap stated as a
 * share of the width is also a fixed share of that banner's height. 7.6vw works out at about a
 * sixth of the banner, at every width.
 *
 * That is the whole point of the number, and the old guard rails defeated it: at -8rem the pull
 * stopped growing around 1100px while the banner kept getting taller, so the overlap ran from a
 * quarter of the banner at 978px down to a seventh at 1920px — the same two blocks meeting
 * differently on every screen. The rails are still here, but pushed out past the sizes anyone
 * browses at, so within that range the proportion holds and only the extremes clamp.
 */
const DEFAULT_MARGIN_TOP = 'clamp(-11rem, -7.6vw, -2.5rem)';

/**
 * Authored margin, replacing a hardcoded `my-8`. Worth knowing where it lands: nothing between this
 * div and the section establishes a block formatting context, so the margin collapses out through
 * both and spaces the section itself — which is what an editor asking for "margin" expects to see,
 * a gap outside this block's background rather than inside it.
 */
const spacing = computed(() => ({
  marginTop: cssLength(props.marginTop, DEFAULT_MARGIN_TOP),
  marginBottom: cssLength(props.marginBottom, '2rem'),
}));

const buttons = computed<CtaButton[]>(() => {
  const list = (props.buttons ?? []).filter((b) => b?.url && (b.label || b.image));
  if (list.length) return list;
  return props.buttonLabel && props.buttonUrl ? [{ label: props.buttonLabel, url: props.buttonUrl }] : [];
});

/**
 * Clamped rather than trusted: the value is interpolated straight into a grid template, and one
 * bad number would drop the whole declaration instead of failing on its own.
 */
const columns = computed<number>(() => {
  const n = Math.round(Number(props.perRow));
  return Number.isFinite(n) ? Math.min(4, Math.max(1, n)) : 1;
});

/** Inert on mobile, where the track is a flex row rather than a grid. */
const gridStyle = computed(() => ({ gridTemplateColumns: `repeat(${columns.value}, minmax(0, 1fr))` }));

const track = ref<HTMLElement | null>(null);
const active = ref(0);

/** Cards across the swipe track on a phone. The grid above `md` is the author's `perRow` instead. */
const PER_VIEW = 2;
/** One dot per swipe, so a track of three cards is two dots rather than three. */
const pages = computed(() => Math.ceil(buttons.value.length / PER_VIEW));

/**
 * How wide a card is on the swipe track — the whole of the mobile layout, in one value.
 *
 * A short track divides by what is actually on it rather than by {@link PER_VIEW}: three
 * buttons laid out in quarters would sit bunched to the left with a quarter of the sheet
 * empty beside them, which reads as a mistake rather than as a row. Only once there is more
 * than a screenful is a card cut narrower than its share — and that difference is the sliver
 * the next card shows through, the one thing on screen saying the track goes on.
 *
 * Every width is written out in full because Tailwind reads the source for class names: a
 * width assembled from a variable would never reach the stylesheet.
 */
const CARD_WIDTHS = ['w-4/5', 'w-[calc(50%-0.5rem)]'] as const;
/** Cut back by a whole gap, so a sliver of the third card shows past the pair. */
const CARD_WIDTH_PEEK = 'w-[calc(50%-1.5rem)]';

const cardWidth = computed(() => {
  const n = buttons.value.length;
  return n > PER_VIEW ? CARD_WIDTH_PEEK : (CARD_WIDTHS[n - 1] ?? CARD_WIDTH_PEEK);
});

/**
 * Where the first card sits once the track's own padding is counted — the offset every card is
 * measured against, so a scroll position of 0 reads as page 0 rather than as one padding short.
 */
function origin(el: HTMLElement): number {
  return (el.children[0] as HTMLElement | undefined)?.offsetLeft ?? 0;
}

/**
 * Which pair the track has settled on. Read from the scroll position rather than tracked as slide
 * state, so a finger swipe and a dot press stay in agreement without either driving the other.
 */
function onScroll(): void {
  const el = track.value;
  if (!el) return;
  const start = origin(el);
  let nearest = 0;
  let shortest = Infinity;
  // Only the leading card of each pair can be snapped to, so only those are measured.
  for (let i = 0; i < el.children.length; i += PER_VIEW) {
    const card = el.children[i] as HTMLElement;
    const distance = Math.abs(card.offsetLeft - start - el.scrollLeft);
    if (distance < shortest) {
      shortest = distance;
      nearest = i / PER_VIEW;
    }
  }
  active.value = nearest;
}

function goTo(page: number): void {
  const el = track.value;
  const card = el?.children[page * PER_VIEW] as HTMLElement | undefined;
  if (!el || !card) return;
  // To the left edge, not the centre: a pair centred would sit half off both sides of the track.
  el.scrollTo({ left: card.offsetLeft - origin(el), behavior: 'smooth' });
}

/** Router links keep in-app navigation; anything absolute has to leave through a plain anchor. */
function isInternal(url?: string): boolean {
  return !!url && !url.startsWith('http');
}

function linkTag(button: CtaButton): typeof RouterLink | 'a' {
  return isInternal(button.url) ? RouterLink : 'a';
}

function linkProps(button: CtaButton): Record<string, unknown> {
  return isInternal(button.url) ? { to: button.url } : { href: button.url, rel: 'noopener' };
}
</script>

<template>
  <div :style="spacing" class="py-16 text-center rounded-2xl text-black">
    <!-- Fluid rather than a fixed step: viewport-proportional, with clamp ends for readability.
         3vw is only ~12px on a phone, so the lower end is what every mobile viewport actually
         gets — it is raised on its own to keep the desktop ramp unchanged. -->
    <!-- <h2 class="font-bold leading-tight text-[clamp(2rem,3vw,3.5rem)] mb-[clamp(0.5rem,1vw,1rem)]">{{ title }}</h2> -->
    <p
      v-if="text"
      class="opacity-90 max-w-xl mx-auto px-4 text-[clamp(0.8rem,1.2vw,1.25rem)] mb-[clamp(0.75rem,1.6vw,1.5rem)]"
    >
      {{ text }}
    </p>

    <div v-if="buttons.length">
      <!-- One track, two layouts. On phones it is a scroll-snap row two cards wide, which buys
           real momentum swiping from the browser instead of a drag handler; from `md` up it becomes
           the grid the author configured, and the snap/scroll rules switch off with it.
           `scroll-px-4` matches the padding, so a snapped card lands level with the track's edge
           rather than under it. -->
      <div
        ref="track"
        :style="gridStyle"
        class="cta-track flex snap-x snap-mandatory overflow-x-auto gap-4 px-4 scroll-px-4 items-center
               md:grid md:snap-none md:overflow-visible md:gap-16 md:px-4 md:justify-items-center"
        :class="buttons.length === 1 ? 'justify-center md:justify-normal' : ''"
        @scroll.passive="onScroll"
      >
        <!-- The hover dim is skipped where a hover image already owns the hover: two opacity
             animations running over the same pixels read as a stutter rather than one move. -->
        <component
          :is="linkTag(button)"
          v-for="(button, i) in buttons"
          :key="i"
          v-bind="linkProps(button)"
          class="group relative block shrink-0 snap-start"
          :class="[
            cardWidth,
            button.image ? 'md:w-full md:shrink' : 'bg-white font-semibold px-8 py-3 rounded-lg md:w-auto md:shrink',
            button.hoverImage ? '' : 'transition hover:opacity-90',
          ]"
          :style="button.image ? {} : { color: 'var(--color-primary)' }"
        >
          <!-- An uploaded image stands in for the button face, with the label captioned beneath it. -->
          <template v-if="button.image">
            <!-- The artwork gets its own positioning box. Anchoring the hover layer to the link
                 instead would stretch it over the caption as well, since that is the box the
                 caption shares. -->
            <span class="relative block">
              <!-- Both layers animate. Leaving this one opaque under the hover image would be the
                   steadier swap, but only for artwork that actually covers what it replaces: these
                   buttons are a shape on a mostly transparent canvas, so an un-faded base shows
                   straight through its replacement. -->
              <img
                :src="button.image"
                alt=""
                class="h-auto w-full transition-opacity duration-500 ease-out motion-reduce:transition-none"
                :class="button.hoverImage ? 'group-hover:opacity-0' : ''"
              />
              <!-- Rendered rather than swapped into `src` on hover: both files are then already
                   decoded, so the first hover fades in instead of flashing an empty box. Touch
                   screens have no hover state and simply keep the first image. -->
              <img
                v-if="button.hoverImage"
                :src="button.hoverImage"
                alt=""
                aria-hidden="true"
                class="absolute inset-0 h-full w-full object-contain opacity-0 transition-opacity
                       duration-500 ease-out group-hover:opacity-100 motion-reduce:transition-none"
              />
            </span>
            <!-- The caption is the button's accessible name, so the artwork above it is marked
                 decorative rather than repeating the same words to a screen reader. -->
            <span
              v-if="button.label"
              class="mt-2 block rounded-full border-2 border-[#ea480c] bg-white px-5 py-3
                     font-semibold leading-snug text-[clamp(0.9rem,1.1vw,1.15rem)]
                     transition-colors duration-500 ease-out motion-reduce:transition-none
                     group-hover:bg-[#ea480c] group-hover:text-white"
            >
              {{ button.label }}
            </span>
          </template>
          <template v-else>{{ button.label }}</template>
        </component>
      </div>

      <!-- Position readout for the swipe track; the grid needs none. -->
      <div v-if="pages > 1" class="flex justify-center gap-2 mt-4 md:hidden">
        <button
          v-for="(_, i) in pages"
          :key="i"
          class="w-2.5 h-2.5 rounded-full transition-colors"
          :style="{ background: i === active ? '#ea480c' : '#d1d5db' }"
          :aria-label="`Page ${i + 1}`"
          @click="goTo(i)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The dots are the position indicator; a scrollbar under the buttons only adds noise. */
.cta-track {
  scrollbar-width: none;
}
.cta-track::-webkit-scrollbar {
  display: none;
}
</style>
