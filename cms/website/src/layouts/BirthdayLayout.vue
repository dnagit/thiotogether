<script setup lang="ts">
/**
 * Chrome for the birthday pages, which are a party rather than a part of the site.
 *
 * The site header is a tall banner bar with the whole navigation behind it; a wall of
 * balloons handed out by QR code at a party wants none of that. What is here instead is a
 * slim bar with the way back to the site, the two birthday pages, and nothing else.
 *
 * The wall is one fixed screen: the shell is `100svh`, the bar and the flowers float over
 * it, and the sky between them is the whole viewport — so the balloons rise from below the
 * bottom edge, past the flowers and behind the logo, and are sized by the space they are
 * given rather than by arithmetic on the viewport.
 *
 * The form is an ordinary page that scrolls as far as it needs to. See `pinned`.
 *
 * The footer is its own artwork rather than the site's hill and mascot, and is built the
 * same way: a full-bleed picture anchored to the bottom edge with a spacer reserving its
 * height. See `.foot-space`.
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useMediaQuery } from '@vueuse/core';
import { useSiteStore } from '@/stores/site';

const site = useSiteStore();
const route = useRoute();

/**
 * Whether this page is one fixed screen with the chrome pinned to it.
 *
 * The wall is: it is a picture, so the shell is exactly `100svh`, the bar and the flowers
 * float over it, and the balloons rise the whole way between them.
 *
 * The wish form is not. It is reading matter and longer than a screen, so it scrolls the way
 * a page scrolls — nothing pinned, nothing trapped in an inner scroll box, the flowers
 * arriving at the end of the form rather than sitting on top of it.
 */
const pinned = computed(() => route.name === 'birthday-wall');

/**
 * The band of clouds across the top.
 *
 * Three short loops with an alpha channel, each holding one cloud that all but fills its
 * 1920×800 frame — so an instance *is* a cloud, and the band is built by scattering a few
 * of them. Sizes and offsets are in `vw` throughout: this is a picture of a sky and should
 * scale with the page rather than reflow inside it.
 *
 * Ten of them on a wide screen and eight on a phone. Every instance is another VP9 decoder
 * running at the source's full 1920×800 however small it is drawn, so they are made wide
 * and overlapping rather than small and many — if this ever costs too much on an old phone,
 * re-export the three files at 960×400 and nothing here has to change.
 *
 * Note for Safari: these are VP9-with-alpha, which it does not composite. There, the sky is
 * simply cloudless — the page is built to look right without them.
 */
const wide = useMediaQuery('(min-width: 700px)');

/**
 * Two arrangements rather than one that scales.
 *
 * Widths are in `vw` in both, which is what keeps a cloud a cloud rather than a shape that
 * reflows. Where they part company is the vertical: on a wide screen the bank is a band
 * across the top and `vw` places it, but a phone is a third as wide and twice as tall, so
 * the same numbers draw a sliver. There the tops are in `svh` instead, and the bank is
 * carried down to about halfway.
 */
type Cloud = {
  src: 1 | 2 | 3;
  left: number;
  width: number;
  top: string;
  flip?: boolean;
  /** Seconds into the 7.68s loop to start at, so two instances of one file differ. */
  seek?: number;
};

const CLOUDS_WIDE: Cloud[] = [
  // Three overlapping runs. A scatter leaves holes; the artwork this copies is a solid bank.
  { src: 1, left: -12, width: 44, top: '-8vw' },
  { src: 2, left: 18, width: 46, top: '-9vw' },
  { src: 1, left: 50, width: 46, top: '-8vw', flip: true },
  { src: 2, left: 78, width: 44, top: '-7vw', flip: true },

  { src: 3, left: -6, width: 42, top: '1vw', flip: true },
  { src: 2, left: 26, width: 44, top: '2vw' },
  { src: 1, left: 60, width: 44, top: '1vw', flip: true },

  { src: 2, left: 6, width: 40, top: '8vw' },
  { src: 3, left: 40, width: 42, top: '9vw', flip: true },
  { src: 1, left: 72, width: 42, top: '8vw' },
];

// Four runs carrying the bank down to about two thirds of the screen, where a phone has
// height to spare and the top-only band of the wide layout would look like a fringe.
/*
 * Four runs, each a mirrored pair.
 *
 * `left` positions the *frame*, and none of the three sources has its cloud centred in its
 * own frame — they sit at 45%, 56% and 49% of it. Place by eye and the bank leans: the
 * first attempt covered the left half half again as much as the right, and both a
 * bounding-box correction and a search over measured density profiles tipped it as far the
 * other way, because a run high enough to be half off the top of the screen contributes
 * almost nothing to what is actually seen.
 *
 * So balance is made structural rather than tuned. Each run is one source twice, the second
 * mirrored and offset to `100 − left − width`, which is symmetric about the centre of the
 * screen whatever the artwork does and whatever part of the run is on screen.
 *
 * The clouds are drawn wider than the screen on purpose. A source is transparent around its
 * edges as well as inside its frame, so runs spaced by the frame height leave bands of sky
 * between them; oversized clouds overlap enough to close those, and four runs of two cover
 * what five of two did — which is four fewer decoders on a phone.
 *
 * `seek` is what keeps that from looking like a mirror: the pair share a file, so without it
 * they would drift in perfect symmetry. Starting one half a loop in breaks the reflection
 * while leaving the balance alone.
 */
const CLOUDS_NARROW: Cloud[] = [
  { src: 3, left: -34, width: 118, top: '-16svh' },
  { src: 3, left: 16, width: 118, top: '-16svh', flip: true, seek: 3.8 },
  { src: 1, left: -32, width: 116, top: '2svh' },
  { src: 1, left: 16, width: 116, top: '2svh', flip: true, seek: 3.8 },
  { src: 2, left: -36, width: 120, top: '20svh' },
  { src: 2, left: 16, width: 120, top: '20svh', flip: true, seek: 3.8 },
  // Pushed apart and set at different heights: at the same height in exact reflection they
  // read as one shape repeated rather than two clouds. The offsets stay mirrored, so the
  // balance above is untouched.
  { src: 1, left: -42, width: 124, top: '34svh', flip: true },
  { src: 1, left: 18, width: 124, top: '42svh', seek: 3.8 },
];

const clouds = computed(() =>
  (wide.value ? CLOUDS_WIDE : CLOUDS_NARROW).map((cloud, index) => ({
    key: `${cloud.src}-${index}`,
    src: `/images/Cloud${cloud.src}.gif`,
    seek: cloud.seek,
    style: {
      left: `${cloud.left}vw`,
      top: cloud.top,
      width: `${cloud.width}vw`,
      transform: cloud.flip ? 'scaleX(-1)' : undefined,
    },
  })),
);

/** Someone who asked for less movement gets the same sky, holding still. */
const stillness = useMediaQuery('(prefers-reduced-motion: reduce)');
function onCloudReady(event: Event): void {
  const video = event.target as HTMLVideoElement;
  const seek = Number(video.dataset.seek);
  if (seek > 0 && video.currentTime < 0.1) video.currentTime = seek;
  if (stillness.value) video.pause();
}
</script>

<template>
  <div class="birthday-shell birthday-bg font-sukhumvit" :class="{ 'shell-pinned': pinned }">
    <!-- Scenery. Behind everything, and never in the way of a tap. -->
    <div class="sky-clouds" aria-hidden="true">
      <img
        v-for="cloud in clouds"
        :key="cloud.key"
        class="cloud"
        :src="cloud.src"
        :style="cloud.style"
        :data-seek="cloud.seek"
        autoplay
        muted
        loop
        playsinline
        preload="auto"
        @loadeddata="onCloudReady"
      />
    </div>

    <header class="bar" :class="{ 'bar-float': pinned }">
      <RouterLink to="/" class="home" :title="site.siteName">
        <img src="/images/logo-birthday.png" :alt="site.siteName" class="home-logo" />
      </RouterLink>
    </header>

    <main class="birthday-main">
      <slot />
    </main>

    <!--
      No backdrop colour: the artwork is the footer. Its canvas is transparent above the
      flowers, so the page's own background shows through and the field reads as the bottom
      of the page rather than a band stuck onto it.
    -->
    <footer class="foot" :class="{ 'foot-float': pinned }">
      <!-- <p class="foot-text" v-html="footerText"></p> -->
      <img
        src="/images/bg-footer-birthday.png"
        alt=""
        aria-hidden="true"
        class="foot-art"
      />
      <div class="foot-space" aria-hidden="true"></div>
    </footer>
  </div>
</template>

<style scoped>
/*
 * One screen, three bands: the bar, the page, the artwork.
 *
 * `svh` rather than `vh` or `dvh` — `vh` on a phone is taller than what is actually
 * visible, so the flowers would sit under the address bar, and `dvh` changes as that bar
 * hides, which would resize the whole shell mid-scroll. `svh` is the one that is both
 * visible and still.
 */
.birthday-shell {
  --bar-h: clamp(84px, 13vw, 132px);
  /* The shared name for "how tall the thing at the top is", which pages still read. */
  --header-h: var(--bar-h);
  /*
   * How much bigger the flowers are drawn than the page is wide. The artwork is a strip
   * along the bottom of its canvas, so at page width it makes a thin verge; drawn wider it
   * is cropped at the sides and the field grows into something you could walk in.
   *
   * `--foot-h` is the reserve that follows from it, and is published rather than kept
   * private because a page may want to stand something in the flowers — the wall puts its
   * call to action there. See `.cta` in BirthdayWallView.
   */
  --foot-scale: 1.22;
  --foot-h: calc(10.5vw * var(--foot-scale));
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  /*
   * `clip`, not `hidden`: the clouds overhang both edges on purpose and something has to cut
   * them off, but `hidden` on one axis forces the other to `auto` — which would put every
   * page back in an inner scroll box, the thing this is trying not to do.
   */
  overflow-x: clip;
}

/* The wall, and only the wall: exactly one screen, with nothing scrolling anywhere. */
.shell-pinned {
  height: 100svh;
  overflow: hidden;
}
/* A phone is a third of the width, so the same multiple would draw a third of the field. */
@media (max-width: 699px) {
  .birthday-shell {
    --foot-scale: 2.6;
  }
}

/*
 * The clouds hang off the top of the shell rather than filling a box of their own: their
 * own transparency is the edge of the band, so there is nothing to clip them to. What keeps
 * them from running off the page is the shell's `overflow: hidden`.
 */
.sky-clouds {
  position: absolute;
  inset: 0 0 auto 0;
  height: 0;
  /*
   * Behind the page's own content but in front of the fixed backdrop, which sits at the
   * same depth and is painted first. Anything at 0 or above here would come out on top of
   * the wish form's text as it scrolled past.
   */
  z-index: -1;
  pointer-events: none;
}
.cloud {
  position: absolute;
  height: auto;
  /* The source frames are 1920×800; `auto` height keeps that ratio at any width. */
  aspect-ratio: 1920 / 800;
}

/* No backdrop, no border, no blur: the page's own artwork runs straight up behind it. */
.bar {
  position: relative;
  /* Over everything on the page — the logo belongs in front, as in the artwork. */
  z-index: 40;
  flex: none;
  height: var(--bar-h);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Laid over the page rather than stacked above it: what lets the balloons reach the top. */
.bar-float {
  position: absolute;
  inset: 0 0 auto 0;
}

.home {
  display: flex;
  min-width: 0;
}
.home-logo {
  height: calc(var(--bar-h) - 16px);
  width: auto;
  /* Wide artwork on a narrow phone would otherwise push the bar sideways. */
  max-width: min(78vw, 460px);
  object-fit: contain;
}

/*
 * No `z-index`: that would box the balloons into a stacking context of their own, and they
 * have to sit above the flowers (1) while the button stays above them both (30).
 *
 * No `overflow` either. It used to scroll inside itself on every page, which on the form
 * meant a scroll container exactly as tall as its own content — nothing to scroll — and
 * `overscroll-behavior: contain` then refused to hand the gesture on to the page. On a
 * mouse that still limped along; on a touchscreen the form simply would not move.
 */
.birthday-main {
  position: relative;
  flex: 1 1 auto;
}

/*
 * Pinned, the page cannot grow, so here it does scroll inside itself — and here `contain`
 * is right, because there is nothing behind it to scroll.
 */
.shell-pinned .birthday-main {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.foot {
  position: relative;
  flex: none;
  overflow: hidden;
}
/*
 * Under the balloons (10–16), so they rise in front of the flowers rather than out from
 * behind them — but over the clouds (−1) and the backdrop.
 */
.foot-float {
  position: absolute;
  inset: auto 0 0 0;
  z-index: 1;
}
.foot-text {
  position: relative;
  z-index: 1;
  padding: 0 1rem 0.75rem;
  text-align: center;
  font-size: 0.75rem;
  color: #6b7280;
}
/*
 * Anchored to the bottom and as wide as the page. Only the lower third of the canvas is
 * painted, so the transparent remainder overflows upwards and is clipped — which keeps the
 * flowers' scale tied to the page width without the empty part padding the footer out.
 */
.foot-art {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 0;
  width: calc(100% * var(--foot-scale));
  height: auto;
  max-width: none;
  pointer-events: none;
  user-select: none;
}
/*
 * Reserves the height of the painted part. The canvas is 1920×800 and the flowers start
 * 615px down, so they stand (800 − 615) / 1920 = 9.64% of the page width tall; `--foot-h`
 * rounds that up a little, because a few petals reach higher than that row.
 */
.foot-space {
  height: var(--foot-h);
}

@media (prefers-reduced-motion: reduce) {
  .tab {
    transition: none;
  }
}
</style>
