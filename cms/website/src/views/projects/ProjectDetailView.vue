<script setup lang="ts">
/**
 * One project: the cover, the write-up, and however many pictures it has.
 *
 * The list is a block that can sit on any page; this is a route, because a project is one
 * thing at one address — which is also what makes it shareable and indexable.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { get } from '@/api/client';
import { applySeo } from '@/composables/useSeo';

interface GalleryImage {
  url?: string;
  caption?: string | null;
}

interface Project {
  id: number;
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  coverImage: string | null;
  images: GalleryImage[] | null;
  eventDate: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

const route = useRoute();
const slug = String(route.params.slug ?? '');

const project = ref<Project | null>(null);
const loading = ref(true);
const notFound = ref(false);

void (async () => {
  try {
    const p = await get<Project>(`/projects/${encodeURIComponent(slug)}`);
    project.value = p;
    applySeo({
      title: p.metaTitle || p.title,
      metaDescription: p.metaDescription || p.summary || undefined,
      ogImage: p.coverImage ?? undefined,
    });
  } catch (err: any) {
    notFound.value = err?.response?.status === 404;
  } finally {
    loading.value = false;
  }
})();

/**
 * The pictures to show, cover first.
 *
 * The cover is part of the gallery here even though the API keeps them apart: on the list it
 * is the one picture that stands for the project, but on this page it is simply the first
 * one — and repeating it lower down, or leaving it out of the sequence, both read as a slip.
 */
const gallery = computed<GalleryImage[]>(() => {
  const p = project.value;
  if (!p) return [];
  const rest = (p.images ?? []).filter((i) => i?.url);
  const coverAlready = rest.some((i) => i.url === p.coverImage);
  return p.coverImage && !coverAlready ? [{ url: p.coverImage }, ...rest] : rest;
});

const dateText = computed(() =>
  project.value?.eventDate
    ? new Date(project.value.eventDate).toLocaleDateString('th-TH', { dateStyle: 'long' })
    : '',
);

/* ── The slider ─────────────────────────────────────────────────────────────
 *
 * A scroll-snap track rather than a transform-driven carousel: the browser then owns the
 * momentum, the rubber-banding and the trackpad, all of which a hand-written slider has to
 * reimplement and none of which it does as well. The arrows and the dots drive the same
 * scroll position a finger does, so the three can never disagree about which slide is up.
 */
const track = ref<HTMLElement | null>(null);
const current = ref(0);

function onScroll(): void {
  const el = track.value;
  if (!el) return;
  const centre = el.scrollLeft + el.clientWidth / 2;
  let nearest = 0;
  let shortest = Infinity;
  for (let i = 0; i < el.children.length; i += 1) {
    const slide = el.children[i] as HTMLElement;
    const distance = Math.abs(slide.offsetLeft + slide.offsetWidth / 2 - centre);
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
  if (!el || !slide) return;
  el.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' });
}

const step = (by: number): void => slideTo(Math.min(gallery.value.length - 1, Math.max(0, current.value + by)));

/* ── The lightbox ───────────────────────────────────────────────────────────
 *
 * Which picture is open, or null for none. The slider crops every photograph into one frame
 * so the set reads as a set; this is where the picture is seen whole, which is the reason
 * the crop up there is allowed to be a crop.
 */
const openAt = ref<number | null>(null);
const box = ref<HTMLElement | null>(null);
let lastFocused: HTMLElement | null = null;

const opened = computed(() => (openAt.value === null ? null : gallery.value[openAt.value]));

function openImage(index: number): void {
  openAt.value = index;
}

function closeImage(): void {
  if (openAt.value === null) return;
  // The slider follows the lightbox, so closing leaves the page on the picture just viewed.
  slideTo(openAt.value);
  openAt.value = null;
}

function moveImage(by: number): void {
  if (openAt.value === null || !gallery.value.length) return;
  // Wraps, because a lightbox is a loop: there is no "end of the page" to stop at.
  openAt.value = (openAt.value + by + gallery.value.length) % gallery.value.length;
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
    // Two buttons and a picture: keep Tab inside them rather than behind the backdrop.
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

onBeforeUnmount(() => {
  document.body.style.overflow = '';
});
</script>

<template>
  <div class="container-site page">
    <p v-if="loading" class="note" aria-live="polite">กำลังโหลด…</p>

    <div v-else-if="!project" class="note center">
      <h1 class="missing">{{ notFound ? 'ไม่พบโปรเจกต์นี้' : 'โหลดข้อมูลไม่สำเร็จ' }}</h1>
      <p>{{ notFound ? 'ลิงก์อาจไม่ถูกต้อง หรือโปรเจกต์นี้ถูกซ่อนไปแล้ว' : 'กรุณาลองใหม่อีกครั้ง' }}</p>
      <RouterLink to="/" class="back">← กลับหน้าแรก</RouterLink>
    </div>

    <article v-else>
      <header class="head">
        <h1>{{ project.title }}</h1>
        <p v-if="dateText" class="date">{{ dateText }}</p>
        <p v-if="project.summary" class="summary">{{ project.summary }}</p>
      </header>

      <!--
        The pictures, one at a time, cropped to a single frame so the set reads as a set.
        Tapping one opens it whole — which is what makes the crop here acceptable.
      -->
      <div v-if="gallery.length" class="slider">
        <ul ref="track" class="track" role="list" @scroll.passive="onScroll">
          <li v-for="(img, i) in gallery" :key="i">
            <button type="button" class="slide" @click="openImage(i)">
              <img :src="img.url" :alt="img.caption || project.title" loading="lazy" />
              <span class="zoom" aria-hidden="true">⤢</span>
              <span class="sr-only">ดูรูปเต็ม{{ img.caption ? ` — ${img.caption}` : '' }}</span>
            </button>
            <p v-if="img.caption" class="caption">{{ img.caption }}</p>
          </li>
        </ul>

        <template v-if="gallery.length > 1">
          <button
            type="button"
            class="arrow arrow-prev"
            aria-label="รูปก่อนหน้า"
            :disabled="current === 0"
            @click="step(-1)"
          >‹</button>
          <button
            type="button"
            class="arrow arrow-next"
            aria-label="รูปถัดไป"
            :disabled="current === gallery.length - 1"
            @click="step(1)"
          >›</button>

          <div class="dots">
            <button
              v-for="(_, i) in gallery"
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
      </div>

      <!-- Authored in the admin, so it is rendered as written. -->
      <div v-if="project.description" class="prose-cms body" v-html="project.description"></div>
    </article>

    <!-- The picture, whole, over everything else. -->
    <Teleport to="body">
      <Transition name="lightbox">
        <div
          v-if="opened"
          class="lightbox"
          role="dialog"
          aria-modal="true"
          :aria-label="opened.caption || project?.title || 'รูปภาพ'"
          @keydown="onKeydown"
        >
          <div class="lightbox-backdrop" @click="closeImage"></div>

          <div ref="box" class="lightbox-inner">
            <button type="button" class="close" aria-label="ปิด" @click="closeImage">×</button>

            <img :src="opened.url" :alt="opened.caption || project?.title" />
            <p v-if="opened.caption" class="lightbox-caption">{{ opened.caption }}</p>
            <p v-if="gallery.length > 1" class="lightbox-count">
              {{ (openAt ?? 0) + 1 }} / {{ gallery.length }}
            </p>

            <template v-if="gallery.length > 1">
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
.page {
  padding: clamp(1.5rem, 4vw, 3.5rem) 1rem clamp(3rem, 8vw, 6rem);
  max-width: 52rem;
}
.note {
  text-align: center;
  color: #6b7280;
  padding: 3rem 0;
}
.center h1 {
  font-size: 1.35rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: #111827;
}
.back {
  display: inline-block;
  margin-top: 1rem;
  color: var(--color-primary, #2563eb);
}

.head {
  text-align: center;
  margin-bottom: clamp(1.5rem, 4vw, 2.5rem);
}
.head h1 {
  margin: 0;
  font-weight: 800;
  line-height: 1.25;
  font-size: clamp(1.5rem, 4vw, 2.6rem);
  text-wrap: balance;
}
.date {
  margin: 0.5rem 0 0;
  color: #6b7280;
  font-size: 0.95rem;
}
.summary {
  margin: 0.75rem auto 0;
  max-width: 38rem;
  color: #374151;
  line-height: 1.7;
}

/* ── Slider ──────────────────────────────────────────────────────────────── */
.slider {
  position: relative;
  margin-bottom: clamp(1.5rem, 4vw, 2.5rem);
}
/*
 * `scroll-snap` on the track, and nothing else: the slide widths do the rest. Hiding the
 * scrollbar is safe here only because the arrows and dots say the same thing it would.
 */
.track {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: clamp(0.75rem, 2vw, 1.25rem);
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
 * One frame for every slide, whatever shape the file is. A set of photographs is portrait,
 * landscape and square all at once, and a track whose height changes with each one lurches
 * as it moves. The picture is seen uncropped in the lightbox instead.
 */
.slide img {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
}
.zoom {
  position: absolute;
  right: 0.75rem;
  bottom: 0.75rem;
  width: 2.25rem;
  height: 2.25rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgb(0 0 0 / 55%);
  color: #fff;
  font-size: 1.1rem;
  line-height: 1;
}
.slide:focus-visible {
  outline: 3px solid var(--color-primary, #2563eb);
  outline-offset: 3px;
}

.arrow {
  position: absolute;
  top: calc(50% - 1.5rem);
  transform: translateY(-50%);
  width: 2.75rem;
  height: 2.75rem;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: rgb(255 255 255 / 92%);
  color: #111827;
  font-size: 1.75rem;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 2px 10px rgb(0 0 0 / 20%);
}
.arrow-prev { left: 0.5rem; }
.arrow-next { right: 0.5rem; }
.arrow:disabled {
  opacity: 0.35;
  cursor: default;
}

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
  background: #d1d5db;
  cursor: pointer;
  transition: background 0.2s ease;
}
.dot.on {
  background: var(--color-primary, #2563eb);
}

.caption {
  margin: 0.6rem 0 0;
  text-align: center;
  font-size: 0.9rem;
  color: #6b7280;
}

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
/* The whole picture, uncropped — the reason this exists. */
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
.close:hover,
.nav:hover { background: rgb(255 255 255 / 35%); }
.close:hover { background: #fff; }
.close:focus-visible,
.nav:focus-visible {
  outline: 3px solid #fff;
  outline-offset: 2px;
}
/* On a phone there is no room beside the picture, so the arrows sit over its edges. */
@media (max-width: 640px) {
  .nav-prev { left: 0.25rem; }
  .nav-next { right: 0.25rem; }
  .close { top: -0.5rem; right: -0.25rem; }
}

.lightbox-enter-active,
.lightbox-leave-active {
  transition: opacity 0.2s ease;
}
.lightbox-enter-from,
.lightbox-leave-to {
  opacity: 0;
}

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
  .dot {
    transition: none;
  }
}

.body {
  line-height: 1.85;
}
</style>
