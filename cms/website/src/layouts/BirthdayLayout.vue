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

/** The site's own mark from the CMS, worn in the corner. Absent until the settings land. */
const logo = computed(() => site.theme.logoUrl);

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
 * Two transparent PNGs, each holding one cloud that fills four fifths of its 1920×800 frame
 * and sits centred in it — so an instance *is* a cloud, and the band is built by scattering
 * a number of them at different sizes.
 *
 * They were WebM before, then GIF. WebM lost because Safari will not composite the alpha of
 * a VP9 file and every iPhone got opaque blocks; GIF lost because the three files came to
 * 143 MB and its transparency is one bit, so the soft edges went hard. A PNG has real alpha,
 * works everywhere, and costs two decodes for the whole page however many clouds there are.
 *
 * The drift is the trade that comes with a still image: the artwork no longer animates
 * itself, so the page moves it instead — see `.cloud` in the stylesheet.
 */
const wide = useMediaQuery('(min-width: 700px)');

/**
 * Two arrangements rather than one that scales.
 *
 * Both are written in cloud units — see `--cloud-u` — which keeps a cloud a cloud rather
 * than a shape that reflows. Where they part company is the vertical: on a wide screen the
 * bank is a band across the top and the same unit places it, but a phone is a third as wide
 * and twice as tall, so those numbers would draw a sliver. There `y` is in `svh` and the
 * bank carries much further down the screen.
 *
 * Both hold eleven. The rows differ — four across a wide screen, five down a phone — because
 * a phone fits two or three clouds abreast where a monitor fits five.
 */
type Cloud = {
  src: 1 | 2;
  /**
   * Where the middle of the cloud sits: `x` across the page as a percentage, `y` down it in
   * the set's own unit. Both are the middle of the *cloud*, not of its frame — see `clouds`.
   */
  x: number;
  y: number;
  /** Frame width, in cloud units. The cloud inside it is four fifths of this. */
  width: number;
  flip?: boolean;
  /** How long one sweep of the wander takes. Distance is derived from `width`. */
  time: number;
};

/**
 * No two the same size, and the range is wide enough to read as distance rather than as
 * eleven of one cloud: the largest is a little over twice the smallest.
 */
const CLOUDS_WIDE: Cloud[] = [
  // Top of the bank — edge to edge, and the biggest of them.
  { src: 1, x: 8.4, y: 3.5, width: 37, time: 17 },
  { src: 2, x: 22.5, y: 0.8, width: 30, flip: true, time: 26 },
  { src: 1, x: 37.2, y: 4.2, width: 35, time: 34 },
  { src: 2, x: 54.0, y: 2.7, width: 32, flip: true, time: 22 },
  { src: 1, x: 75.3, y: 2.9, width: 36, time: 31 },
  { src: 2, x: 90.7, y: 0.5, width: 31, flip: true, time: 19 },

  // Second course, set into the gaps above so no sky shows between them.
  { src: 1, x: 9.7, y: 12.2, width: 34, flip: true, time: 27 },
  { src: 2, x: 27.1, y: 13.0, width: 27, time: 35 },
  { src: 1, x: 45.4, y: 11.4, width: 33, flip: true, time: 23 },
  { src: 2, x: 63.6, y: 10.5, width: 28, time: 32 },
  { src: 1, x: 78.2, y: 12.2, width: 29, flip: true, time: 20 },
  { src: 2, x: 94.1, y: 9.0, width: 26, time: 28 },

  // The lower edge. Hung at three different depths, which is what scallops it.
  { src: 2, x: 34.9, y: 20.5, width: 22, flip: true, time: 25 },
  { src: 1, x: 58.2, y: 18.2, width: 24, time: 33 },
  { src: 2, x: 92.8, y: 15.8, width: 23, flip: true, time: 21 },
];

/**
 * The same eleven clouds, rearranged rather than reduced.
 *
 * A phone is a third as wide and twice as tall, so the wide set's four rows would draw a
 * sliver across the top: `y` is in `svh` here and the bank carries much further down. The
 * clouds are far wider as a share of the page — a phone only fits two or three across — but
 * far smaller in pixels, which is what "scale to the screen" comes to on this axis.
 */
const CLOUDS_NARROW: Cloud[] = [
  // A looser bank than the wide set's: fewer courses, smaller clouds, more sky between.
  { src: 1, x: 10.4, y: 4.3, width: 53, time: 17 },
  { src: 2, x: 35.5, y: 0.2, width: 43, flip: true, time: 26 },
  { src: 1, x: 74.0, y: 2.5, width: 57, time: 34 },

  { src: 2, x: 23.4, y: 10.6, width: 48, flip: true, time: 22 },
  { src: 1, x: 63.2, y: 12.3, width: 58, time: 31 },
  { src: 2, x: 89.3, y: 8.7, width: 38, flip: true, time: 19 },

  // The lower edge, thinning as it goes.
  { src: 1, x: 16.5, y: 18.3, width: 52, time: 27 },
  { src: 2, x: 32.3, y: 16.7, width: 40, flip: true, time: 35 },
  { src: 1, x: 79.8, y: 20.3, width: 55, time: 23 },
  { src: 2, x: 16.5, y: 27.1, width: 46, flip: true, time: 32 },
  { src: 1, x: 55.5, y: 22.9, width: 50, time: 20 },
  { src: 2, x: 77.1, y: 28.8, width: 36, flip: true, time: 28 },
];

/** Where the painted cloud sits inside its frame. Measured: x 9–88.3%, y the full height. */
const CLOUD_CENTRE_X = 0.486;
/** Frame height as a share of its width — the files are 1920×800. */
const FRAME_RATIO = 800 / 1920;

const clouds = computed(() => {
  const wideSet = wide.value;
  const unit = wideSet ? 'u' : 'svh';
  return (wideSet ? CLOUDS_WIDE : CLOUDS_NARROW).map((cloud, index) => {
    // Both axes are anchored on the middle of the cloud, so a size can be changed on its own:
    // it grows around where it already sat instead of shoving off to the right and upwards.
    const halfHeight = (cloud.width * FRAME_RATIO) / 2;
    /*
     * Sideways travel is what carries the wander, and it is tied to size: the big clouds are
     * the near ones, so they sweep furthest, and the small ones sit back and barely move.
     *
     * The wide bank can afford a longer sweep — it is five or six clouds across, so its
     * neighbours still overlap at the extremes. A phone fits three, and the same distance
     * pulls them apart into gaps and throws the left/right weight out by a third of the
     * screen, so the portrait bank travels less far.
     */
    const drift = cloud.width / (wideSet ? 5 : 6);
    /*
     * The bob is the second half of it. One `alternate` animation can only slide a cloud back
     * and forth along a line, which reads as a slideshow the moment two clouds line up; a
     * second animation on a different axis *and* a different period turns that into a slow
     * open loop that never visibly repeats. The ratio varies per cloud so no two trace the
     * same figure, and it is kept clear of 1/2 and 3/4 so a cloud does not fall into step
     * with itself either.
     */
    const bobTime = cloud.time * (0.58 + ((index * 3) % 5) * 0.04);
    const u = (n: number) => `calc(${n.toFixed(2)} * var(--cloud-u))`;
    return {
      key: `${cloud.src}-${index}`,
      src: `/images/Cloud${cloud.src}.png`,
      frame: {
        left: `calc(${cloud.x}% - ${CLOUD_CENTRE_X * cloud.width} * var(--cloud-u))`,
        top:
          unit === 'u'
            ? u(cloud.y - halfHeight)
            : `calc(${cloud.y}svh - ${halfHeight} * var(--cloud-u))`,
        width: u(cloud.width),
        '--drift': u(drift),
        animationDuration: `${cloud.time}s`,
        // Negative, so they are already spread through their wander when the page opens.
        animationDelay: `-${(cloud.time * ((index * 0.37) % 1)).toFixed(1)}s`,
      },
      art: {
        '--flip-x': cloud.flip ? -1 : 1,
        '--bob': u(cloud.width / 26),
        animationDuration: `${bobTime.toFixed(1)}s`,
        // Offset from the sideways one, so a cloud is never at both extremes at once.
        animationDelay: `-${(bobTime * ((index * 0.61 + 0.23) % 1)).toFixed(1)}s`,
      },
    };
  });
});
</script>

<template>
  <div class="birthday-shell birthday-bg" :class="{ 'shell-pinned': pinned }">
    <!-- Scenery. Behind everything, and never in the way of a tap. -->
    <div class="sky-clouds" aria-hidden="true">
      <!--
        Two elements per cloud, because the wander is two animations: the frame carries it
        sideways, the picture inside bobs on its own clock. One element could only do one of
        them — a second `animation` on the same box replaces the first transform.
      -->
      <div v-for="cloud in clouds" :key="cloud.key" class="cloud" :style="cloud.frame">
        <img class="cloud-art" :src="cloud.src" :style="cloud.art" alt="" decoding="async" />
      </div>
    </div>

    <header class="bar" :class="{ 'bar-float': pinned }">
      <!--
        The site's mark in the corner, taken out of the flow so the party's own wordmark
        stays centred on the page rather than on what is left beside this. Decorative: the
        wordmark next to it is already the way back to the site, and two links to the same
        place read as two choices.
      -->
         <RouterLink to="/" class="home" :title="site.siteName">
      <img v-if="logo" :src="logo" alt="" aria-hidden="true" class="brand-logo" />
          </RouterLink>
      
        <img src="/images/logo-birthday.png" :alt="site.siteName" class="home-logo" />
     
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
  /*
   * The logo is sized off this, and its canvas carries about a third of its height in
   * transparent margin — the mark itself is only 71% of the file — so the bar has to run
   * taller than the artwork looks to give the mark the presence it wants.
   */
  --bar-h: clamp(100px, 16vw, 164px);
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
  /*
   * The unit the whole cloud band is drawn in — sizes, positions and travel alike.
   *
   * It wants to be `1vw`, because a cloud measured against the page width stays the same
   * cloud whatever the window does. The trouble is that the band is then as deep as the page
   * is wide, which on a short wide monitor runs most of the way down the screen. `min` hands
   * the decision to whichever axis is tighter: `vw` on ordinary and tall screens, where
   * nothing changes, and `svh` once the window is wider than about 16:9, where the clouds
   * shrink together and the band stays inside its share of the height.
   *
   * 1.55 is that share divided by the band's depth in units — see the arrangements above,
   * whose lowest cloud reaches 37 — so the bank stops just under 60% of the screen.
   */
  --cloud-u: min(1vw, 1.55svh);
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
 * them from running off the page is the shell's clipping.
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
.cloud,
.cloud-art {
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  animation-direction: alternate;
  will-change: transform;
}

/* The frame: placed by the script, and the half of the wander that goes sideways. */
.cloud {
  position: absolute;
  animation-name: drift-x;
}

.cloud-art {
  display: block;
  width: 100%;
  height: auto;
  /* The source frames are 1920×800; `auto` height keeps that ratio at any width. */
  aspect-ratio: 1920 / 800;
  animation-name: bob-y;
}

@keyframes drift-x {
  from {
    transform: translateX(calc(var(--drift) * -1));
  }
  to {
    transform: translateX(var(--drift));
  }
}

/*
 * The flip rides along in the bob's transform — it has to, or it would replace it. Scaling by
 * ±1 rather than swapping the property in and out keeps that a single rule.
 */
@keyframes bob-y {
  from {
    transform: translateY(calc(var(--bob) * -1)) scaleX(var(--flip-x));
  }
  to {
    transform: translateY(var(--bob)) scaleX(var(--flip-x));
  }
}

/* Someone who asked for less movement gets the sky, holding still. */
@media (prefers-reduced-motion: reduce) {
  .cloud {
    animation: none;
  }
  .cloud-art {
    animation: none;
    transform: scaleX(var(--flip-x));
  }
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

/*
 * Top left, and off the flex line: centring the wordmark against the rest of the bar would
 * shift it right by half this logo's width, and it would go on shifting as the CMS logo
 * changed shape. Sized off the bar like everything else here.
 */
.brand-logo {
  position: absolute;
  left: clamp(0.5rem, 2vw, 1.5rem);
  top: 50%;
  transform: translateY(-50%);
  height: calc(var(--bar-h) * 0.82);
  width: auto;
  max-width: 32vw;
  object-fit: contain;
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
