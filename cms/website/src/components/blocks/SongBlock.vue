<script setup lang="ts">
/**
 * One song: a title bar that opens, a video, the places to listen, the credits and the words.
 *
 * A block holds a single track, so a release is built by stacking one per song — which is
 * also the only shape the CMS can edit, since each song carries its own list of streaming
 * links and the props editor nests lists one level deep.
 *
 * The video is a facade rather than an embed: a still and a play button until someone asks
 * for it. A page of ten songs would otherwise load ten YouTube players, each of them heavier
 * than the rest of the page put together, before a visitor has pressed anything.
 */
import { computed, ref } from 'vue';

/** A place to listen: an uploaded icon and where it goes. */
interface Listen {
  icon?: string;
  url?: string;
  label?: string;
}

const props = withDefaults(
  defineProps<{
    /** The line in the title bar — the song, and whoever it is by. */
    title?: string;
    /** A YouTube link in any of its shapes, or the bare id. */
    videoUrl?: string;
    listen?: Listen[];
    /** Heading above the credits; the credits themselves, one per line. */
    creditsTitle?: string;
    credits?: string;
    /** Heading above the words; the words themselves, blank lines and all. */
    lyricsTitle?: string;
    lyrics?: string;
    /** Whether the card starts open. The first song on a page usually should. */
    startOpen?: boolean;

    headerColor?: string;
    headerTextColor?: string;
    buttonColor?: string;
    cardColor?: string;
    borderColor?: string;
  }>(),
  {
    title: '',
    listen: () => [],
    creditsTitle: 'เครดิต',
    lyricsTitle: 'เนื้อเพลง',
    startOpen: false,
    headerColor: '#ffd966',
    headerTextColor: '#3b2a12',
    buttonColor: '#c9302c',
    cardColor: '#ffffff',
    borderColor: '#ffe9a3',
  },
);

const open = ref(props.startOpen);

/** Ties the button to the region it opens, for anything reading the page aloud. */
const uid = `song-${Math.random().toString(36).slice(2, 9)}`;

/**
 * The video's id, dug out of whatever was pasted.
 *
 * Editors paste the address bar, the share link, or the id on its own, and all three have to
 * work — asking someone to extract an id by hand is how a block ends up with a blank frame.
 */
const videoId = computed(() => {
  const raw = (props.videoUrl ?? '').trim();
  if (!raw) return '';
  if (/^[\w-]{11}$/.test(raw)) return raw;
  const patterns = [
    /[?&]v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /\/embed\/([\w-]{11})/,
    /\/shorts\/([\w-]{11})/,
    /\/live\/([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = raw.match(p);
    if (m) return m[1];
  }
  return '';
});

/** `nocookie` so a visitor who never presses play is not tracked by having read the page. */
const embedUrl = computed(() =>
  videoId.value
    ? `https://www.youtube-nocookie.com/embed/${videoId.value}?autoplay=1&rel=0`
    : '',
);
const posterUrl = computed(() =>
  videoId.value ? `https://i.ytimg.com/vi/${videoId.value}/hqdefault.jpg` : '',
);

/** Swapped in only once the visitor asks for it — see the note at the top. */
const playing = ref(false);

const listenLinks = computed(() => props.listen.filter((l) => l?.icon || l?.url));
const isExternal = (url: string): boolean => /^(https?:)?\/\/|^mailto:|^tel:/i.test(url);

const shell = computed(() => ({
  '--header': props.headerColor,
  '--header-ink': props.headerTextColor,
  '--btn': props.buttonColor,
  '--card': props.cardColor,
  '--edge': props.borderColor,
}));
</script>

<template>
  <div class="song" :style="shell">
    <!--
      One frame holds the lot. The title bar is the top of the card rather than a pill
      floating above it, so a closed song is a single object on the page and the border runs
      round the name as well as the words.
    -->
    <div class="frame">
    <!-- The bar is the control: the whole of it opens the card, not just the chevron. -->
    <button
      type="button"
      class="bar"
      :aria-expanded="open"
      :aria-controls="uid"
      @click="open = !open"
    >
      <span class="chev" aria-hidden="true">
        <svg viewBox="0 0 24 24" :class="{ up: open }">
          <path
            d="M6 9l6 6 6-6"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
      <span class="bar-title">{{ title }}</span>
    </button>

    <!--
      The panel animates between `0fr` and `1fr` rather than between two heights: the words of
      a song are however long they are, and a fixed max-height either clips the long ones or
      leaves the short ones opening onto empty space.
    -->
    <div class="panel" :class="{ 'panel-open': open }" :id="uid" role="region">
      <div class="panel-inner">
        <div class="card">
          <!-- Video -->
          <div v-if="videoId" class="video">
            <iframe
              v-if="playing"
              :src="embedUrl"
              title="YouTube"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
            ></iframe>
            <button v-else type="button" class="poster" @click="playing = true">
              <img :src="posterUrl" alt="" loading="lazy" />
              <span class="play" aria-hidden="true">
                <svg viewBox="0 0 68 48">
                  <path
                    d="M66.5 7.7a8.6 8.6 0 0 0-6-6C55.2 0 34 0 34 0S12.8 0 7.5 1.6a8.6 8.6 0 0 0-6 6A89.6 89.6 0 0 0 0 24a89.6 89.6 0 0 0 1.5 16.3 8.6 8.6 0 0 0 6 6C12.8 48 34 48 34 48s21.2 0 26.5-1.6a8.6 8.6 0 0 0 6-6A89.6 89.6 0 0 0 68 24a89.6 89.6 0 0 0-1.5-16.3z"
                    fill="#f00"
                  />
                  <path d="M27 34l18-10-18-10z" fill="#fff" />
                </svg>
              </span>
              <span class="sr-only">เล่นวิดีโอ</span>
            </button>
          </div>

          <!-- Where to listen -->
          <div v-if="listenLinks.length" class="listen">
            <component
              :is="l.url ? (isExternal(l.url) ? 'a' : 'RouterLink') : 'span'"
              v-for="(l, i) in listenLinks"
              :key="i"
              v-bind="
                l.url
                  ? isExternal(l.url)
                    ? { href: l.url, target: '_blank', rel: 'noopener noreferrer' }
                    : { to: l.url }
                  : {}
              "
              class="listen-link"
              :aria-label="l.label || undefined"
            >
              <img v-if="l.icon" :src="l.icon" alt="" loading="lazy" />
              <span v-else class="listen-dot" aria-hidden="true"></span>
            </component>
          </div>

          <!-- Credits, then the words. Both keep the line breaks they were typed with. -->
          <section v-if="credits" class="text-block">
            <h3>{{ creditsTitle }}</h3>
            <p>{{ credits }}</p>
          </section>

          <section v-if="lyrics" class="text-block">
            <h3>{{ lyricsTitle }}</h3>
            <p>{{ lyrics }}</p>
          </section>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>

<style scoped>
.song {
  max-width: 46rem;
  margin: 0 auto 1.25rem;
  container-type: inline-size;
}

/*
 * `overflow: hidden` is what rounds the title bar: the bar itself is a plain rectangle and
 * the frame clips its top corners to whatever radius is set here, so the two can never
 * disagree about how round they are.
 */
.frame {
  border: 2px solid var(--edge);
  border-radius: 1.5rem;
  background: var(--card);
  overflow: hidden;
}

/* ── Title bar ───────────────────────────────────────────────────────────── */
.bar {
  width: 100%;
  display: flex;
  align-items: center;
  gap: clamp(0.6rem, 2.5cqw, 1.25rem);
  padding: clamp(0.5rem, 2cqw, 1rem);
  border: 0;
  background: var(--header);
  color: var(--header-ink);
  text-align: left;
  cursor: pointer;
}
.bar:focus-visible {
  outline: 3px solid var(--btn);
  /* Inside the frame, which clips anything outside it. */
  outline-offset: -3px;
}
.bar-title {
  font-weight: 700;
  font-size: clamp(0.95rem, 3.2cqw, 1.5rem);
  line-height: 1.25;
  /* Wraps rather than truncates: a song's name is the one thing on the bar. */
  overflow-wrap: anywhere;
}

.chev {
  flex: none;
  width: clamp(2.2rem, 8cqw, 3.5rem);
  height: clamp(2.2rem, 8cqw, 3.5rem);
  border-radius: 50%;
  background: var(--btn);
  color: #fff;
  display: grid;
  place-items: center;
}
.chev svg {
  width: 60%;
  height: 60%;
  transition: transform 0.25s ease;
}
.chev svg.up {
  transform: rotate(180deg);
}

/* ── The opening panel ───────────────────────────────────────────────────── */
.panel {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.28s ease;
}
.panel-open {
  grid-template-rows: 1fr;
}
.panel-inner {
  overflow: hidden;
  min-height: 0;
}

/* The frame draws the border and the background now; this only spaces the contents. */
.card {
  padding: clamp(1rem, 4cqw, 2rem);
  display: flex;
  flex-direction: column;
  gap: clamp(1rem, 3cqw, 1.75rem);
}

/* ── Video ───────────────────────────────────────────────────────────────── */
.video {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 0.75rem;
  overflow: hidden;
  background: #000;
}
.video iframe,
.poster {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
}
.poster {
  padding: 0;
  cursor: pointer;
  background: #000;
}
/*
 * `hqdefault` is 4:3 with the video letterboxed inside it, so it is cropped to the frame
 * rather than fitted — fitted, every still would carry its own black bars on top of ours.
 */
.poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.play {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: clamp(3rem, 12cqw, 4.5rem);
  transition: transform 0.15s ease;
}
.poster:hover .play {
  transform: translate(-50%, -50%) scale(1.08);
}
.play svg {
  width: 100%;
  height: auto;
  filter: drop-shadow(0 2px 6px rgb(0 0 0 / 45%));
}

/* ── Streaming links ─────────────────────────────────────────────────────── */
.listen {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: clamp(0.5rem, 2cqw, 1rem);
}
.listen-link {
  display: block;
  width: clamp(2.4rem, 9cqw, 3.6rem);
  height: clamp(2.4rem, 9cqw, 3.6rem);
  border-radius: 50%;
  overflow: hidden;
  transition: transform 0.16s ease-out;
}
a.listen-link:hover,
a.listen-link:focus-visible {
  transform: translateY(-3px) scale(1.06);
}
.listen-link img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.listen-dot {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: var(--btn);
}

/* ── Credits and words ───────────────────────────────────────────────────── */
.text-block h3 {
  margin: 0 0 0.4rem;
  font-weight: 700;
  font-size: clamp(0.95rem, 2.8cqw, 1.2rem);
}
/*
 * `pre-line` keeps the line breaks the editor typed and collapses nothing else — which is
 * what a verse is: lines that end where they were written, not where the box runs out.
 */
.text-block p {
  margin: 0;
  white-space: pre-line;
  line-height: 1.75;
  font-size: clamp(0.85rem, 2.4cqw, 1.05rem);
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
  .panel,
  .chev svg,
  .play,
  .listen-link {
    transition: none;
  }
}
</style>
