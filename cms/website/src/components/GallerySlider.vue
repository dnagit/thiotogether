<script setup lang="ts">
/**
 * A row of pictures that slides, and opens one whole when tapped.
 *
 * Written once and used by both the project detail page and the journey block — the two
 * wanted the same thing, and a second copy of a slider is a second set of arrow, dot and
 * keyboard bugs to find.
 *
 * The track is scroll-snap rather than a transform carousel: the browser then owns momentum,
 * rubber-banding and the trackpad, none of which a hand-written slider does as well. Arrows,
 * dots and autoplay all drive that same scroll position, so they cannot disagree about which
 * slide is up.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { SlideImage } from './gallery';

const props = withDefaults(
  defineProps<{
    images: SlideImage[];
    /** Slides across on a desktop. Phones get one, tablets two, whatever this says. */
    perView?: number | string;
    /** Frame every slide is cropped into, as `w / h`. The lightbox shows them uncropped. */
    ratio?: string;
    /** Advance on its own. Stops on hover, on focus, and while the lightbox is open. */
    autoplay?: boolean;
    /** Seconds between moves. */
    interval?: number | string;
    /** Used as the alt text on a picture that has no caption of its own. */
    label?: string;
  }>(),
  { perView: 3, ratio: '4 / 3', autoplay: false, interval: 4, label: '' },
);

const slides = computed(() => props.images.filter((i) => i?.url));

const perView = computed(() => {
  const n = Math.round(Number(props.perView));
  return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 3;
});

const trackStyle = computed(() => ({
  '--per-view': String(perView.value),
  '--ratio': props.ratio,
}));

/* ── Position ─────────────────────────────────────────────────────────────── */
const track = ref<HTMLElement | null>(null);
const current = ref(0);

function onScroll(): void {
  const el = track.value;
  if (!el) return;
  const left = el.scrollLeft;
  let nearest = 0;
  let shortest = Infinity;
  for (let i = 0; i < el.children.length; i += 1) {
    const slide = el.children[i] as HTMLElement;
    const distance = Math.abs(slide.offsetLeft - (el.children[0] as HTMLElement).offsetLeft - left);
    if (distance < shortest) {
      shortest = distance;
      nearest = i;
    }
  }
  current.value = nearest;
}

function slideTo(index: number): void {
  const el = track.value;
  const slide = el?.children[index] as HTMLElement | undefined;
  const first = el?.children[0] as HTMLElement | undefined;
  if (!el || !slide || !first) return;
  el.scrollTo({ left: slide.offsetLeft - first.offsetLeft, behavior: 'smooth' });
}

const step = (by: number): void =>
  slideTo(Math.min(slides.value.length - 1, Math.max(0, current.value + by)));

/* ── Autoplay ─────────────────────────────────────────────────────────────── */
const paused = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;

/**
 * Never runs for someone who asked for less motion — a carousel that moves on its own is the
 * clearest case of the thing that setting is about.
 */
const wantsMotion = (): boolean =>
  typeof window === 'undefined' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function stopAutoplay(): void {
  clearInterval(timer);
  timer = undefined;
}

function startAutoplay(): void {
  stopAutoplay();
  if (!props.autoplay || !wantsMotion() || slides.value.length <= perView.value) return;
  const every = Math.max(1.5, Number(props.interval) || 4) * 1000;
  timer = setInterval(() => {
    if (paused.value) return;
    // Wraps: an autoplay that stops at the end leaves the row parked and looking broken.
    const next = current.value + 1 >= slides.value.length ? 0 : current.value + 1;
    slideTo(next);
  }, every);
}

onMounted(startAutoplay);
watch(() => [props.autoplay, props.interval, slides.value.length, perView.value], startAutoplay);
onBeforeUnmount(() => {
  stopAutoplay();
  document.body.style.overflow = '';
});

/* ── Lightbox ─────────────────────────────────────────────────────────────── */
const openAt = ref<number | null>(null);
const box = ref<HTMLElement | null>(null);
let lastFocused: HTMLElement | null = null;

const opened = computed(() => (openAt.value === null ? null : slides.value[openAt.value]));

function openImage(index: number): void {
  openAt.value = index;
}

function closeImage(): void {
  if (openAt.value === null) return;
  // The track follows, so closing leaves the row on the picture just looked at.
  slideTo(openAt.value);
  openAt.value = null;
}

function moveImage(by: number): void {
  if (openAt.value === null || !slides.value.length) return;
  openAt.value = (openAt.value + by + slides.value.length) % slides.value.length;
}

function onKeydown(e: KeyboardEvent): void {
  if (openAt.value === null) return;
  if (e.key === 'Escape') {
    e.stopPropagation();
    closeImage();
  } else if (e.key === 'ArrowRight') {
    moveImage(1);
  } else if (e.key === 'ArrowLeft') {
    moveImage(-1);
  } else if (e.key === 'Tab') {
    const items = [...(box.value?.querySelectorAll<HTMLElement>('button') ?? [])].filter(
      (el) => el.offsetParent !== null,
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

watch(openAt, async (value) => {
  // The row holds still behind the lightbox; moving on underneath it is disorienting.
  paused.value = value !== null;
  if (value !== null) {
    lastFocused = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';
    await nextTick();
    box.value?.querySelector<HTMLElement>('button')?.focus();
  } else {
    document.body.style.overflow = '';
    lastFocused?.focus();
  }
});
</script>

<template>
  <div v-if="slides.length" class="slider" @mouseenter="paused = true" @mouseleave="paused = false">
    <ul
      ref="track"
      class="track"
      :style="trackStyle"
      role="list"
      @scroll.passive="onScroll"
      @focusin="paused = true"
      @focusout="paused = false"
    >
      <li v-for="(img, i) in slides" :key="i">
        <button type="button" class="slide" @click="openImage(i)">
          <img :src="img.url" :alt="img.caption || label" loading="lazy" />
          <span class="zoom" aria-hidden="true">⤢</span>
          <span class="sr-only">ดูรูปเต็ม{{ img.caption ? ` — ${img.caption}` : '' }}</span>
        </button>
        <p v-if="img.caption" class="caption">{{ img.caption }}</p>
      </li>
    </ul>

    <template v-if="slides.length > perView">
      <button
        type="button"
        class="arrow arrow-prev"
        aria-label="ก่อนหน้า"
        :disabled="current === 0"
        @click="step(-1)"
      >‹</button>
      <button
        type="button"
        class="arrow arrow-next"
        aria-label="ถัดไป"
        :disabled="current >= slides.length - 1"
        @click="step(1)"
      >›</button>

      <div class="dots">
        <button
          v-for="(_, i) in slides"
          :key="i"
          type="button"
          class="dot"
          :class="{ on: i === current }"
          :aria-label="`ไปที่รูปที่ ${i + 1}`"
          :aria-current="i === current"
          @click="slideTo(i)"
        />
      </div>
    </template>

    <Teleport to="body">
      <Transition name="lightbox">
        <div
          v-if="opened"
          class="lightbox"
          role="dialog"
          aria-modal="true"
          :aria-label="opened.caption || label || 'รูปภาพ'"
          @keydown="onKeydown"
        >
          <div class="lightbox-backdrop" @click="closeImage"></div>

          <div ref="box" class="lightbox-inner">
            <button type="button" class="close" aria-label="ปิด" @click="closeImage">×</button>

            <img :src="opened.url" :alt="opened.caption || label" />
            <p v-if="opened.caption" class="lightbox-caption">{{ opened.caption }}</p>
            <p v-if="slides.length > 1" class="lightbox-count">
              {{ (openAt ?? 0) + 1 }} / {{ slides.length }}
            </p>

            <template v-if="slides.length > 1">
              <button type="button" class="nav nav-prev" aria-label="รูปก่อนหน้า" @click="moveImage(-1)">‹</button>
              <button type="button" class="nav nav-next" aria-label="รูปถัดไป" @click="moveImage(1)">›</button>
            </template>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.slider {
  position: relative;
  /*
   * The controls' colour, taken from the CTA block's pagination so every "move along" control
   * on the site reads as the same control. Named here rather than repeated at each use, so
   * the arrows, the dots and the focus ring cannot drift apart.
   */
  --control: #ea480c;
  --control-off: #d1d5db;
}

/*
 * One slide per view on a phone, two from 640px, and the caller's number from 1024px. The
 * middle step is not a compromise: a row that jumps from one to four leaves the slides a
 * thumbnail wide at the sizes in between.
 */
.track {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: clamp(0.75rem, 2vw, 1.5rem);
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
}
.track::-webkit-scrollbar {
  display: none;
}
.track > li {
  flex: 0 0 100%;
  scroll-snap-align: start;
}
@media (min-width: 640px) {
  .track > li {
    flex-basis: calc((100% - clamp(0.75rem, 2vw, 1.5rem)) / 2);
  }
}
@media (min-width: 1024px) {
  .track > li {
    flex-basis: calc(
      (100% - (var(--per-view) - 1) * clamp(0.75rem, 2vw, 1.5rem)) / var(--per-view)
    );
  }
}

.slide {
  display: block;
  position: relative;
  width: 100%;
  padding: 0;
  border: 0;
  border-radius: 1rem;
  overflow: hidden;
  background: #eef2f7;
  cursor: zoom-in;
}
/*
 * One frame for every slide whatever shape the file is: a row whose height changes with each
 * picture lurches as it moves. The picture is seen whole in the lightbox instead, which is
 * what makes the crop here acceptable.
 */
.slide img {
  display: block;
  width: 100%;
  aspect-ratio: var(--ratio);
  object-fit: cover;
}
.zoom {
  position: absolute;
  right: 0.6rem;
  bottom: 0.6rem;
  width: 2rem;
  height: 2rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgb(0 0 0 / 50%);
  color: #fff;
  font-size: 1rem;
  line-height: 1;
}
.slide:focus-visible {
  outline: 3px solid var(--control);
  outline-offset: 3px;
}

.caption {
  margin: 0.5rem 0 0;
  text-align: center;
  font-size: 0.875rem;
  color: #6b7280;
}

.arrow {
  position: absolute;
  top: calc(50% - 1rem);
  transform: translateY(-50%);
  width: 2.75rem;
  height: 2.75rem;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: rgb(255 255 255 / 92%);
  /* The chevron itself carries the colour; the disc behind it stays white so it reads on any
     picture underneath. */
  color: var(--control);
  font-size: 1.75rem;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 2px 10px rgb(0 0 0 / 20%);
}
.arrow-prev { left: 0.25rem; }
.arrow-next { right: 0.25rem; }
.arrow:disabled { opacity: 0.35; cursor: default; }

.dots {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.9rem;
}
.dot {
  width: 0.6rem;
  height: 0.6rem;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--control-off);
  cursor: pointer;
  transition: background 0.2s ease;
}
.dot.on { background: var(--control); }

/* ── Lightbox ────────────────────────────────────────────────────────────── */
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  place-items: center;
  padding: clamp(0.75rem, 3vw, 2rem);
}
.lightbox-backdrop {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 88%);
}
.lightbox-inner {
  position: relative;
  max-width: min(1100px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
}
/* Whole and uncropped — the reason the lightbox exists. */
.lightbox-inner img {
  display: block;
  max-width: 100%;
  max-height: 82vh;
  max-height: 82dvh;
  width: auto;
  height: auto;
  border-radius: 0.5rem;
}
.lightbox-caption,
.lightbox-count {
  margin: 0;
  color: #e5e7eb;
  text-align: center;
  font-size: 0.9rem;
}
.lightbox-count {
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
}

.close,
.nav {
  position: absolute;
  border: 0;
  border-radius: 50%;
  background: rgb(255 255 255 / 15%);
  color: #fff;
  cursor: pointer;
  display: grid;
  place-items: center;
  line-height: 1;
}
.close {
  top: -0.75rem;
  right: -0.75rem;
  width: 2.5rem;
  height: 2.5rem;
  font-size: 1.6rem;
  background: rgb(255 255 255 / 92%);
  color: #111827;
}
.nav {
  top: 50%;
  transform: translateY(-50%);
  width: 3rem;
  height: 3rem;
  font-size: 2rem;
}
.nav-prev { left: -1rem; }
.nav-next { right: -1rem; }
.close:hover, .nav:hover { background: rgb(255 255 255 / 35%); }
.close:hover { background: #fff; }
.close:focus-visible, .nav:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
@media (max-width: 640px) {
  .nav-prev { left: 0.25rem; }
  .nav-next { right: 0.25rem; }
  .close { top: -0.5rem; right: -0.25rem; }
}

.lightbox-enter-active,
.lightbox-leave-active { transition: opacity 0.2s ease; }
.lightbox-enter-from,
.lightbox-leave-to { opacity: 0; }

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (prefers-reduced-motion: reduce) {
  .lightbox-enter-active,
  .lightbox-leave-active,
  .dot { transition: none; }
}
</style>
