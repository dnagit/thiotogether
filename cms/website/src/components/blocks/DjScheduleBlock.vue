<script setup lang="ts">
/**
 * The DJ calendar, laid out as the stream poster: the on-air DJ's photo on the left, the
 * event title on the right, ON AIR / NEXT DJ across the bottom of the photo, a red month
 * calendar where every day reads OPEN (at least one DJ) or CLOSED (none), and a band of
 * streaming links at the foot. Tapping a day opens that day's line-up.
 *
 * The schedule and the background come from `/public/dj-schedule` (the background is set on
 * the admin's DJ schedule screen); the title, logo, mascot and links are this block's props.
 * Days and times are Bangkok's (UTC+7), whatever the visitor's own clock says.
 *
 * The poster is sized in container units (`cqw`) measured off the artwork, so it keeps the
 * artwork's proportions from a phone to a desktop — up to the block's 1500px — rather than
 * reflowing into a different picture.
 *
 * The data is fetched again every minute, so ON AIR changes hands on its own when a slot ends.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { get } from '@/api/client';
import AppModal from '@/components/AppModal.vue';
import type { PublicDjSchedule, PublicDjSlot } from '@cms/shared';

/** A streaming service in the footer band: an uploaded icon and where it goes. */
interface StreamLink {
  icon?: string;
  url?: string;
  label?: string;
}

const props = withDefaults(
  defineProps<{
    /** The big outlined title. One line per line of text. */
    heading?: string;
    logo?: string;
    /** A sticker beside the ON AIR line — the tooth, on the poster. */
    mascot?: string;
    /**
     * The big photo on the left — the artist, as on the poster. It stays put while DJs change
     * hands; the on-air DJ's own picture is the small icon in front of their name.
     * (Named for its first job; kept so blocks saved with it keep their photo.)
     */
    fallbackPhoto?: string;
    onAirLabel?: string;
    nextLabel?: string;
    accentColor?: string;
    showNext?: boolean;
    /** The button beside ON AIR, out to the streaming app. Hidden while it has no link. */
    streamLabel?: string;
    streamUrl?: string;
    /**
     * Pictures to use in place of the drawn signs — the neon ON AIR, OPEN and CLOSED of the
     * artwork. Each is optional; a sign without one is drawn as text, as before.
     */
    onAirIcon?: string;
    offAirIcon?: string;
    openIcon?: string;
    closedIcon?: string;
    links?: StreamLink[];
    /** The text at the right of the footer band. One line per line of text. */
    footerText?: string;
  }>(),
  {
    heading: 'STREAM\nFOR THI-O',
    logo: '',
    mascot: '',
    fallbackPhoto: '',
    onAirLabel: 'ON AIR',
    nextLabel: 'NEXT DJ',
    accentColor: '#ff2a4f',
    showNext: true,
    streamLabel: 'STREAM NOW',
    streamUrl: '',
    onAirIcon: '',
    offAirIcon: '',
    openIcon: '',
    closedIcon: '',
    links: () => [],
    footerText: '',
  },
);

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/*
 * Every day and time here is Bangkok's, whatever the visitor's own clock says: the show runs
 * on Thai time, and a fan abroad reading 18:00 should read the hour it airs in Bangkok.
 *
 * Bangkok is UTC+7 all year (no daylight saving), so a moment's Bangkok wall clock is the
 * moment shifted by seven hours and read with the UTC getters. A calendar day is held the
 * same way: a Date at 00:00 UTC whose UTC year/month/date are the Bangkok ones.
 */
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
const TZ = 'Asia/Bangkok';
/** A moment as its Bangkok wall clock, read with getUTC*(). */
const bkk = (d: Date) => new Date(d.getTime() + BKK_OFFSET_MS);
/** The Bangkok calendar day a moment falls on. */
const bkkDay = (d: Date) => {
  const w = bkk(d);
  return new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()));
};
/** A calendar day, `n` days on. */
const addDays = (day: Date, n: number) =>
  new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + n));
/** The moment a Bangkok calendar day begins. */
const dayStart = (day: Date) => new Date(day.getTime() - BKK_OFFSET_MS);

const today = bkkDay(new Date());
const month = ref(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));

const data = ref<PublicDjSchedule | null>(null);
const loading = ref(true);
const failed = ref(false);

const pad = (n: number) => String(n).padStart(2, '0');
/** `YYYY-MM-DD` of a calendar day. */
const dayKey = (day: Date) =>
  `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`;
/** Whether two moments fall on the same Bangkok day. */
const sameBkkDay = (a: Date, b: Date) => dayKey(bkkDay(a)) === dayKey(bkkDay(b));
const isToday = (day: Date) => dayKey(day) === dayKey(today);

/** The six weeks the grid covers, Sunday first. */
const gridDays = computed(() => {
  const first = month.value;
  const start = addDays(first, -first.getUTCDay());
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
});

/**
 * The cells drawn: this month's days, with blanks (null) before the 1st so it lands under its
 * weekday. Days of the months either side are left out, as on the poster.
 */
const cells = computed<Array<Date | null>>(() => {
  const m = month.value;
  const days = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)).getUTCDate();
  return [
    ...Array.from({ length: m.getUTCDay() }, () => null),
    ...Array.from({ length: days }, (_, i) => addDays(m, i)),
  ];
});

async function load(): Promise<void> {
  const days = gridDays.value;
  const from = dayStart(days[0]);
  const to = dayStart(addDays(days[41], 1));
  try {
    data.value = await get<PublicDjSchedule>('/dj-schedule', {
      from: from.toISOString(),
      to: to.toISOString(),
    });
    failed.value = false;
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

watch(month, load, { immediate: true });
const timer = window.setInterval(load, 60_000);
onBeforeUnmount(() => window.clearInterval(timer));

/** Slots touching each Bangkok day, keyed `YYYY-MM-DD`. One past midnight lands on both days. */
const slotsByDay = computed(() => {
  const map = new Map<string, PublicDjSlot[]>();
  for (const s of data.value?.slots ?? []) {
    const end = new Date(s.endsAt);
    let day = bkkDay(new Date(s.startsAt));
    while (dayStart(day) < end) {
      const key = dayKey(day);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
      day = addDays(day, 1);
    }
  }
  return map;
});

const onAir = computed(() => data.value?.onAir ?? null);
const next = computed(() => data.value?.next ?? null);
const photo = computed(() => props.fallbackPhoto || '');

const titleLines = computed(() =>
  props.heading
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean),
);
const footerLines = computed(() =>
  props.footerText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean),
);
const shownLinks = computed(() => props.links.filter((l) => l.icon || l.label));

// ── Wording (Bangkok time) ──────────────────────────────────

const time = (d: Date) => {
  const w = bkk(d);
  return `${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`;
};
const shortDate = (d: Date) =>
  d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: TZ });

/** "18:00–20:00 น.", or with the dates when it does not start and end on the same day. */
function rangeText(s: PublicDjSlot): string {
  const a = new Date(s.startsAt);
  const b = new Date(s.endsAt);
  return sameBkkDay(a, b)
    ? `${time(a)}–${time(b)} น.`
    : `${shortDate(a)} ${time(a)} – ${shortDate(b)} ${time(b)} น.`;
}

/** The next slot's time, prefixed with its day unless that is today (in Bangkok). */
function nextText(s: PublicDjSlot): string {
  const a = new Date(s.startsAt);
  const now = new Date();
  const range = rangeText(s);
  if (sameBkkDay(a, now) || !sameBkkDay(a, new Date(s.endsAt))) return range;
  const tomorrow = dayKey(addDays(bkkDay(now), 1)) === dayKey(bkkDay(a));
  return `${tomorrow ? 'พรุ่งนี้' : shortDate(a)} ${range}`;
}

const monthLabel = computed(() =>
  month.value
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .toUpperCase(),
);

/** A calendar day's name for screen readers, e.g. "21 กันยายน Open". */
const cellLabel = (day: Date) =>
  `${day.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', timeZone: 'UTC' })} ${
    slotsByDay.value.has(dayKey(day)) ? 'Open' : 'Closed'
  }`;

function shiftMonth(by: number): void {
  const m = month.value;
  month.value = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + by, 1));
}

// ── Day popup ───────────────────────────────────────────────

const picked = ref<Date | null>(null);
const pickedSlots = computed(() =>
  picked.value ? (slotsByDay.value.get(dayKey(picked.value)) ?? []) : [],
);
const pickedTitle = computed(() =>
  picked.value
    ? picked.value.toLocaleDateString('th-TH', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '',
);

const isLive = (s: PublicDjSlot) => onAir.value?.id === s.id;

/**
 * The background picture's width / height, once it has loaded. The box takes that shape so the
 * whole picture shows, uncropped; content longer than the picture carries on below it, over
 * the background colour.
 */
const bgRatio = ref<string | null>(null);
watch(
  () => data.value?.appearance.backgroundImage ?? null,
  (url) => {
    bgRatio.value = null;
    if (!url) return;
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight) {
        bgRatio.value = `${img.naturalWidth} / ${img.naturalHeight}`;
      }
    };
    img.src = url;
  },
  { immediate: true },
);

/**
 * The day popup wears the poster's colours: the same background picture, darkened so the
 * line-up reads over it, and the same neon.
 */
const modalStyle = computed(() => {
  const a = data.value?.appearance;
  const style: Record<string, string> = { '--accent': props.accentColor || '#ff2a4f' };
  if (a?.backgroundColor) style['--dj-modal-base'] = a.backgroundColor;
  if (a?.backgroundImage)
    style['--dj-modal-image'] = `url("${a.backgroundImage.replace(/"/g, '%22')}")`;
  return style;
});

/** The background set on the admin's DJ schedule screen, behind the poster's box. */
const bgStyle = computed(() => {
  const a = data.value?.appearance;
  const style: Record<string, string> = { '--accent': props.accentColor || '#ff2a4f' };
  if (a?.backgroundColor) style.backgroundColor = a.backgroundColor;
  if (a?.backgroundImage) {
    style.backgroundImage = `url("${a.backgroundImage.replace(/"/g, '%22')}")`;
    // Full width, top first, never cropped — the box is given the picture's own shape.
    style.backgroundSize = '100% auto';
    style.backgroundPosition = 'center top';
    if (bgRatio.value) style.aspectRatio = bgRatio.value;
  }
  if (a?.textColor) style['--text'] = a.textColor;
  return style;
});
</script>

<template>
  <section class="dj-bg" :class="{ 'has-bg': data?.appearance.backgroundImage }" :style="bgStyle">
    <div class="poster">
      <!-- Photo · title · ON AIR -->
      <div class="hero">
        <img v-if="photo" :src="photo" :alt="onAir?.dj.name ?? ''" class="photo" />

        <div class="title-col">
          <img v-if="logo" :src="logo" alt="" class="logo" />
          <h2 v-if="titleLines.length" class="title">
            <span v-for="(line, i) in titleLines" :key="i" class="title-line">{{ line }}</span>
          </h2>
        </div>

        <div class="air">
          <!--
            The on-air DJ's picture, at the right of the ON AIR lines. It takes the sticker's
            place while there is one to show; the sticker comes back when there is not.
          -->
          <img
            v-if="onAir?.dj.image"
            :src="onAir.dj.image"
            :alt="onAir.dj.name"
            class="air-photo"
          />
          <img v-else-if="mascot" :src="mascot" alt="" class="mascot" />
          <div class="air-top">
            <img
              v-if="onAir ? onAirIcon : offAirIcon"
              :src="onAir ? onAirIcon : offAirIcon"
              :alt="onAir ? onAirLabel : 'OFF AIR'"
              class="badge-icon"
            />
            <span v-else class="badge" :class="{ off: !onAir }">{{
              onAir ? onAirLabel : 'OFF AIR'
            }}</span>
            <a v-if="streamUrl" :href="streamUrl" target="_blank" rel="noopener" class="stream-btn">
              <span class="stream-play" aria-hidden="true">▶</span>{{ streamLabel || 'STREAM NOW' }}
            </a>
          </div>
          <!--
            A ticker: the line runs right to left on a loop. It is drawn twice, back to back,
            so the loop has no gap; screen readers get it once, from the hidden copy.
          -->
          <p v-if="onAir" class="now marquee">
            <span class="sr-only">DJ {{ onAir.dj.name }} {{ rangeText(onAir) }}</span>
            <span class="marquee-track" aria-hidden="true">
              <span v-for="n in 2" :key="n" class="marquee-item">
                <span class="now-name"><b class="dj">DJ</b> {{ onAir.dj.name }}</span>
                <span class="now-time">{{ rangeText(onAir) }}</span>
              </span>
            </span>
          </p>
          <p v-else class="now idle">
            {{ loading ? 'กำลังโหลด…' : 'ตอนนี้ยังไม่มี DJ ออนแอร์' }}
          </p>
          <p v-if="showNext && next" class="next">
            <b>{{ nextLabel }} :</b>
            <img v-if="next.dj.image" :src="next.dj.image" alt="" class="next-avatar" />
            {{ next.dj.name }}
            <b class="next-time">{{ nextText(next) }}</b>
          </p>
        </div>
      </div>

      <!-- Calendar -->
      <div class="cal">
        <div class="cal-head">
          <button type="button" class="nav" aria-label="เดือนก่อนหน้า" @click="shiftMonth(-1)">
            ‹
          </button>
          <h3 class="month" aria-live="polite">{{ monthLabel }}</h3>
          <button type="button" class="nav" aria-label="เดือนถัดไป" @click="shiftMonth(1)">
            ›
          </button>
        </div>

        <p v-if="failed" class="note" role="alert">โหลดตาราง DJ ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง</p>

        <div class="grid">
          <span v-for="w in WEEKDAYS" :key="w" class="weekday" aria-hidden="true">{{ w }}</span>
          <template v-for="(d, i) in cells" :key="d ? dayKey(d) : `blank-${i}`">
            <span v-if="!d" class="day blank" aria-hidden="true"></span>
            <button
              v-else
              type="button"
              class="day"
              :class="{ today: isToday(d), open: slotsByDay.has(dayKey(d)) }"
              :aria-label="cellLabel(d)"
              @click="picked = d"
            >
              <span class="num">{{ d.getUTCDate() }}</span>
              <img
                v-if="slotsByDay.has(dayKey(d)) ? openIcon : closedIcon"
                :src="slotsByDay.has(dayKey(d)) ? openIcon : closedIcon"
                alt=""
                class="state-icon"
              />
              <span v-else class="state">{{ slotsByDay.has(dayKey(d)) ? 'OPEN' : 'CLOSED' }}</span>
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- Streaming links -->
    <div v-if="shownLinks.length || footerLines.length" class="band">
      <div class="band-inner">
        <ul v-if="shownLinks.length" class="links" role="list">
          <li v-for="(l, i) in shownLinks" :key="i">
            <component
              :is="l.url ? 'a' : 'span'"
              :href="l.url || undefined"
              target="_blank"
              rel="noopener"
              class="link"
              :aria-label="l.label || undefined"
            >
              <img v-if="l.icon" :src="l.icon" :alt="l.label ?? ''" />
              <span v-else>{{ l.label }}</span>
            </component>
          </li>
        </ul>
        <p v-if="footerLines.length" class="band-text">
          <span v-for="(line, i) in footerLines" :key="i">{{ line }}</span>
        </p>
      </div>
    </div>

    <AppModal
      :open="!!picked"
      :title="pickedTitle"
      panel-class="dj-modal"
      :panel-style="modalStyle"
      @close="picked = null"
    >
      <p v-if="!pickedSlots.length" class="closed-note">Closed — วันนี้ไม่มี DJ</p>
      <ul v-else class="lineup" role="list">
        <li v-for="s in pickedSlots" :key="s.id" class="slot" :class="{ live: isLive(s) }">
          <img v-if="s.dj.image" :src="s.dj.image" :alt="s.dj.name" class="avatar" loading="lazy" />
          <span v-else class="avatar blank" aria-hidden="true">🎙️</span>
          <span class="slot-body">
            <span class="slot-name">
              DJ {{ s.dj.name }}
              <span v-if="isLive(s)" class="live-tag">{{ onAirLabel }}</span>
            </span>
            <span class="slot-time">{{ rangeText(s) }}</span>
            <span v-if="s.note" class="slot-note">{{ s.note }}</span>
          </span>
        </li>
      </ul>
      <div class="modal-actions">
        <button type="button" class="close-btn" @click="picked = null">ปิด</button>
      </div>
    </AppModal>
  </section>
</template>

<style scoped>
/*
 * Sizes below are the poster's own, measured off the 1500 × 2000 artwork and written as a
 * share of the block's width (`cqw`, 1cqw = 15px of the artwork). The block then draws at the
 * artwork's proportions at any width, lining up with a background made from the same design.
 * The `max(…rem, …cqw)` floors only matter on phones, where the artwork's small print would
 * otherwise drop below what can be read.
 *
 * Without a background from the admin: a dark stage with a red glow behind the title.
 */
.dj-bg {
  --accent: #ff2a4f;
  --text: #fff;
  container-type: inline-size;
  color: var(--text);
  background-color: #120407;
  background-image:
    radial-gradient(60% 45% at 65% 22%, rgba(255, 30, 40, 0.55) 0%, transparent 70%),
    radial-gradient(90% 60% at 20% 10%, rgba(255, 110, 20, 0.25) 0%, transparent 60%),
    linear-gradient(180deg, #1a0508 0%, #0d0204 100%);
  background-size: cover;
  background-position: center top;
  background-repeat: no-repeat;
  /*
   * `clip`, not `hidden`: the box takes the background picture's aspect ratio, and that only
   * stretches to fit longer content while the box is not a scroll container. `hidden` would
   * make it one and cut the calendar off at the bottom of the picture.
   */
  overflow: clip;
  /* When the picture is taller than the poster, the band still sits at the bottom of it. */
  display: flex;
  flex-direction: column;
  /*
   * At most 1500px wide — the artwork's own width, so on a desktop it shows at 1:1 — and
   * the full width of the page's column below that.
   */
  width: 100%;
  max-width: 1500px;
  margin: clamp(1rem, 3vw, 2rem) auto;
  border-radius: clamp(1rem, 2cqw, 2rem);
}

.poster {
  position: relative;
  width: 100%;
  padding: 1.3cqw 0 1.5cqw;
}

/* ── Photo · title · ON AIR ───────────────────────────────── */

.hero {
  position: relative;
  /*
   * The artwork's 64.5cqw — or, on a phone, enough to clear the ON AIR lines, whose type has a
   * floor and so runs taller than the artwork there.
   */
  min-height: max(64.5cqw, calc(45cqw + 6.25rem));
}
/* Artwork: x 100–700, y 0–1000. */
.photo {
  position: absolute;
  /* Decoration: never the thing a tap lands on. */
  pointer-events: none;
  left: 6.5cqw;
  top: -1.3cqw;
  width: 40cqw;
  height: 66cqw;
  object-fit: cover;
  object-position: center top;
  /* A cut-out PNG shows as it is; a square photo fades into the stage instead of boxing it. */
  -webkit-mask-image: linear-gradient(to bottom, #000 70%, transparent 100%);
  mask-image: linear-gradient(to bottom, #000 70%, transparent 100%);
}

/* Artwork: logo centred on x 760; title x 540–1470, y 150–650. */
.title-col {
  position: relative;
  margin-left: 36cqw;
  margin-right: 2cqw;
  /* The title starts at y 160 whether or not there is a logo above it. */
  padding-top: 9cqw;
}
.logo {
  position: absolute;
  pointer-events: none;
  top: 0;
  left: 50.7cqw;
  width: 8cqw;
  height: auto;
  transform: translateX(-50%);
  margin-left: -36cqw;
}
.title {
  margin: 0;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 0.95;
  font-family: Impact, 'Anton', 'Arial Black', 'Helvetica Neue', sans-serif;
  font-style: italic;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.01em;
  color: #c8101e;
  -webkit-text-stroke: 0.55cqw #fff;
  paint-order: stroke fill;
  filter: drop-shadow(0 0 0.8cqw rgba(255, 40, 60, 0.6));
}
.title-line {
  font-size: 16cqw;
  padding-right: 0.5cqw;
  white-space: nowrap;
}
.title-line + .title-line {
  margin-top: 2.5cqw;
}
/* Artwork: STREAM ends at x 1190, short of the line below it. */
.title-line:first-child:not(:last-child) {
  font-size: 12cqw;
  padding-right: 18.5cqw;
}

/* Artwork: badge at x 170, y 700; DJ line y 780–860; NEXT line y 900. */
.air {
  position: absolute;
  left: 11cqw;
  right: 4cqw;
  top: 45cqw;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.8cqw;
}
/* Artwork: x 1120–1440, y 700–930. */
/*
 * The on-air DJ's picture: a square at the right of the ON AIR lines, from the top of the
 * badge to just below NEXT DJ. Sized off the block's width, so it scales like the rest.
 */
.air-photo {
  position: absolute;
  right: 0;
  top: -0.5cqw;
  width: 19cqw;
  height: 19cqw;
  object-fit: cover;
  object-position: center 20%;
  border-radius: 1.5cqw;
  border: max(1.5px, 0.25cqw) solid #fff;
  box-shadow:
    0 0 1cqw var(--accent),
    0 0 2.5cqw color-mix(in srgb, var(--accent) 55%, transparent);
  background: rgba(0, 0, 0, 0.4);
  pointer-events: none;
}
/* The ON AIR lines stop short of the picture rather than running under it. */
.air:has(.air-photo) .now:not(.marquee),
.air:has(.air-photo) .next {
  padding-right: 20.5cqw;
}
/* The ticker is clipped, so it keeps clear of the picture with a margin, not padding. */
.air:has(.air-photo) .now.marquee {
  margin-right: 20.5cqw;
}

/* ── ON AIR ticker ── */
.now.marquee {
  display: block;
  align-self: stretch;
  overflow: hidden;
  white-space: nowrap;
  /* Room for Thai marks above and below the line, which the clip would otherwise cut. */
  padding: 0.15em 0;
  -webkit-mask-image: linear-gradient(to right, transparent 0, #000 4%, #000 96%, transparent 100%);
  mask-image: linear-gradient(to right, transparent 0, #000 4%, #000 96%, transparent 100%);
}
.marquee-track {
  display: inline-flex;
  animation: dj-marquee 14s linear infinite;
}
/* Each copy carries its own trailing gap, so sliding by exactly one copy loops seamlessly. */
.marquee-item {
  display: inline-flex;
  align-items: baseline;
  gap: 2.5cqw;
  padding-right: 8cqw;
}
.now.marquee:hover .marquee-track {
  animation-play-state: paused;
}
@keyframes dj-marquee {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}
/* No motion wanted: the line stands still, shown once, cut with an ellipsis if too long. */
@media (prefers-reduced-motion: reduce) {
  .marquee-track {
    animation: none;
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .marquee-item + .marquee-item {
    display: none;
  }
  .now.marquee {
    -webkit-mask-image: none;
    mask-image: none;
  }
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
.mascot {
  position: absolute;
  right: 0;
  top: 0;
  width: 21cqw;
  height: auto;
  pointer-events: none;
}
/* An uploaded ON AIR / OFF AIR sign — a little larger than the artwork's 5cqw. */
.badge-icon {
  display: block;
  height: max(1.35rem, 5.5cqw);
  width: auto;
  max-width: 30cqw;
  object-fit: contain;
}
.badge {
  padding: 0.2cqw 1cqw;
  border: 0.3cqw solid var(--accent);
  border-radius: 0.5cqw;
  color: #ffd2da;
  font-weight: 800;
  letter-spacing: 0.08em;
  font-size: max(0.7rem, 2.5cqw);
  text-shadow:
    0 0 0.4cqw var(--accent),
    0 0 1cqw var(--accent);
  box-shadow:
    0 0 0.7cqw var(--accent),
    inset 0 0 0.7cqw var(--accent);
}
.air-top {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.5cqw;
}
/*
 * STREAM NOW: a filled neon pill, the one solid thing on the line, so it reads as the thing
 * to press beside a badge that is only a sign.
 */
.stream-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
  padding: 0.35cqw 1.6cqw;
  border-radius: 999px;
  border: 0.25cqw solid #fff;
  background: linear-gradient(135deg, var(--accent) 0%, #c8101e 100%);
  color: #fff;
  font-weight: 900;
  font-style: italic;
  letter-spacing: 0.06em;
  font-size: max(0.7rem, 2.5cqw);
  line-height: 1.3;
  text-decoration: none;
  white-space: nowrap;
  box-shadow:
    0 0 0.8cqw var(--accent),
    0 0 2cqw color-mix(in srgb, var(--accent) 60%, transparent);
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
}
.stream-btn:hover,
.stream-btn:focus-visible {
  transform: translateY(-1px) scale(1.03);
  box-shadow:
    0 0 1.2cqw var(--accent),
    0 0 3cqw var(--accent);
  outline: none;
}
.stream-btn:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 3px;
}
.stream-play {
  font-size: 0.8em;
  font-style: normal;
}
@media (prefers-reduced-motion: reduce) {
  .stream-btn {
    transition: none;
  }
  .stream-btn:hover {
    transform: none;
  }
}
.badge.off {
  border-color: #9ca3af;
  color: #e5e7eb;
  text-shadow: none;
  box-shadow: none;
}
.now {
  position: relative;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: 2.5cqw;
  font-weight: 800;
  /* Small enough that DJ, name and time fit on one line beside the DJ's picture. */
  font-size: max(1.05rem, 4.5cqw);
  line-height: 1.2;
  text-shadow:
    0 0 0.7cqw var(--accent),
    0 0.2cqw 0 rgba(0, 0, 0, 0.35);
  overflow-wrap: anywhere;
}
.now-name {
  display: inline-flex;
  align-items: center;
  gap: 0.3em;
}
.now .dj,
.now-time {
  font-style: italic;
  font-weight: 900;
}
.now .dj {
  font-size: 1.1em;
}
.now-time {
  white-space: nowrap;
}
.now.idle {
  font-size: max(0.95rem, 3.6cqw);
}
.next {
  position: relative;
  margin: 0;
  font-weight: 700;
  font-size: max(0.75rem, 2.6cqw);
  text-shadow: 0 0 0.6cqw var(--accent);
}
/* The next DJ's picture: the same round icon as ON AIR's, at this line's size. */
.next-avatar {
  display: inline-block;
  width: 1.3em;
  height: 1.3em;
  margin: -0.15em 0.1em 0;
  vertical-align: middle;
  border-radius: 999px;
  object-fit: cover;
  object-position: center 20%;
  border: max(1.5px, 0.18cqw) solid #fff;
  box-shadow: 0 0 0.6cqw var(--accent);
  background: rgba(255, 255, 255, 0.1);
}
.next b:first-child {
  font-style: italic;
  font-weight: 900;
}
.next-time {
  font-style: italic;
  white-space: nowrap;
}

/*
 * Phones: the ON AIR lines scale down faster than the artwork does, so a long DJ name still
 * fits on a narrow screen. Each size meets the desktop one at 640px, so nothing jumps there;
 * at 360px the DJ line is about 14.5px and NEXT DJ about 10px.
 */
@container (max-width: 640px) {
  .hero {
    min-height: max(64.5cqw, calc(45cqw + 4.6rem));
  }
  .badge,
  .stream-btn {
    font-size: max(0.55rem, calc(2.1cqw + 0.15rem));
  }
  .badge-icon {
    /* Meets the desktop 5.5cqw at 640px; about 18.5px at 360px. */
    height: max(1.1rem, calc(5.92cqw - 0.17rem));
  }
  .now {
    font-size: max(0.8rem, calc(5.07cqw - 0.23rem));
  }
  .now.idle {
    font-size: max(0.75rem, 3.6cqw);
  }
  .next {
    font-size: max(0.6rem, calc(2.35cqw + 0.1rem));
  }
}

/* ── Calendar ─────────────────────────────────────────────── */

/*
 * Starts where the ON AIR block above it does (`.air`, 11cqw in) and leaves the same on the
 * right, so it sits centred. Everything inside is sized off the block's width, so it scales
 * the same way on a phone — the `max()` floors only keep the smallest print from vanishing.
 */
.cal {
  position: relative;
  /*
   * Above everything in the hero. The photos and the ON AIR lines are positioned over the
   * artwork, and on a phone whose fonts or engine size them a little larger they can reach
   * down over the first rows; the calendar must still be what a tap on a date hits.
   */
  z-index: 2;
  margin: 0 11cqw;
  padding: 0.7cqw 1.8cqw 2.2cqw;
  border: max(1px, 0.2cqw) solid rgba(255, 255, 255, 0.85);
  border-radius: 3cqw;
  background: linear-gradient(145deg, #f0401a 0%, #d8201e 45%, #b0101c 100%);
  box-shadow: 0 1.5cqw 4cqw rgba(0, 0, 0, 0.45);
  color: #fff;
}
.cal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1.2cqw;
}
.month {
  margin: 0;
  font-weight: 800;
  letter-spacing: 0.06em;
  font-size: max(0.6rem, 2cqw);
}
.nav {
  width: max(1.5rem, 3.2cqw);
  height: max(1.5rem, 3.2cqw);
  padding: 0;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: max(0.9rem, 2.3cqw);
  line-height: 1;
  cursor: pointer;
}
.nav:hover,
.nav:focus-visible {
  background: rgba(255, 255, 255, 0.2);
}
.note {
  text-align: center;
  font-weight: 700;
}

.grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}
.weekday {
  text-align: center;
  font-weight: 800;
  font-size: max(0.5rem, 2cqw);
  padding: 0.9cqw 0 3cqw;
}
.day {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 0.3cqw;
  min-height: 8cqw;
  padding: 0;
  border: 0;
  border-radius: 1cqw;
  background: transparent;
  color: #fff;
  font: inherit;
  cursor: pointer;
}
.day.blank {
  cursor: default;
}
.day:not(.blank):hover,
.day:focus-visible {
  background: rgba(255, 255, 255, 0.12);
  outline: none;
}
.day:focus-visible {
  box-shadow: 0 0 0 2px #fff;
}
.num {
  font-size: max(0.65rem, 2.1cqw);
  font-weight: 500;
  line-height: 1.1;
}
.day.today .num {
  font-weight: 900;
  text-decoration: underline;
  text-underline-offset: 0.4cqw;
}

/* Small signs under the date: grey for closed, neon for open, as on the poster. */
/* An uploaded OPEN / CLOSED sign, somewhat taller than the drawn one. */
.state-icon {
  display: block;
  height: max(0.75rem, 3cqw);
  width: auto;
  max-width: 95%;
  object-fit: contain;
}
.state {
  padding: 0 0.35cqw;
  border-radius: 0.3cqw;
  font-size: max(0.4rem, 1.3cqw);
  letter-spacing: 0.03em;
  line-height: 1.3;
  border: 1px solid rgba(255, 255, 255, 0.55);
  background: rgba(40, 40, 40, 0.55);
  color: rgba(255, 255, 255, 0.8);
}
.day.open .state {
  border: 1px solid #ffb3c0;
  background: transparent;
  color: #fff;
  font-weight: 700;
  text-shadow: 0 0 0.4cqw #ff6b86;
  box-shadow:
    0 0 0.6cqw #ff4d6d,
    inset 0 0 0.4cqw #ff4d6d;
}
@container (max-width: 640px) {
  .state {
    padding: 0 1px;
    letter-spacing: 0;
    font-size: max(0.38rem, 1.3cqw);
  }
}

/* ── Streaming band ───────────────────────────────────────── */

/* Artwork: y 1850–2000; icons x 80–630, text centred on x 1045. */
.band {
  margin-top: auto;
  background: linear-gradient(180deg, #a30d1f 0%, #8a0717 100%);
  border-top: 1px solid rgba(255, 255, 255, 0.15);
  color: #fff;
}
.band-inner {
  min-height: 10cqw;
  padding: 1.5cqw 5cqw;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 3cqw;
}
.links {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  gap: 4.5cqw;
}
.link {
  display: block;
  color: inherit;
  text-decoration: none;
  font-weight: 700;
  font-size: max(0.85rem, 2cqw);
}
.link img {
  display: block;
  height: max(2.25rem, 6.5cqw);
  width: auto;
  max-width: 13cqw;
  object-fit: contain;
}
a.link:hover img,
a.link:focus-visible img {
  transform: scale(1.06);
}
.band-text {
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  text-align: center;
  font-size: max(0.7rem, 2.1cqw);
  letter-spacing: 0.03em;
  line-height: 1.45;
}
@container (max-width: 640px) {
  .band-inner {
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.9rem 1rem;
  }
  .links {
    gap: 1.25rem;
  }
  .link img {
    max-width: 6rem;
  }
}

/*
 * Browsers without container units (iOS Safari before 16, and the in-app browsers built on
 * it) drop every `cqw` size, which leaves the pictures at their natural size — large enough
 * to cover the page. There the block is about the width of the screen, so `vw` stands in.
 */
@supports not (width: 1cqw) {
  .hero {
    min-height: 66vw;
  }
  .photo {
    left: 6vw;
    top: 0;
    width: 40vw;
    height: 64vw;
  }
  .logo {
    left: 50vw;
    width: 8vw;
  }
  .title-col {
    margin-left: 34vw;
    padding-top: 9vw;
  }
  .title-line {
    font-size: 14vw;
  }
  .title-line:first-child:not(:last-child) {
    font-size: 11vw;
    padding-right: 16vw;
  }
  .air {
    left: 10vw;
    right: 4vw;
    top: 44vw;
  }
  .air-photo {
    width: 18vw;
    height: 18vw;
  }
  .mascot {
    width: 20vw;
  }
  .badge-icon {
    height: 5.5vw;
  }
  .state-icon {
    height: 3vw;
  }
  .next-avatar {
    width: 1.3em;
    height: 1.3em;
  }
  .cal {
    margin: 0 10vw;
    padding: 1vw 1.5vw 2vw;
  }
  .day {
    min-height: 8vw;
  }
  .link img {
    height: 2.5rem;
    max-width: 6rem;
  }
}

/* ── Popup (teleported: its panel is styled in the unscoped block below) ── */

.closed-note {
  margin: 0;
  padding: 1rem 0;
  text-align: center;
  color: rgba(255, 255, 255, 0.75);
  font-weight: 600;
}
.lineup {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.slot {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}
.slot.live {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  box-shadow:
    0 0 0.6rem color-mix(in srgb, var(--accent) 55%, transparent),
    inset 0 0 0.5rem color-mix(in srgb, var(--accent) 35%, transparent);
}
.avatar {
  flex: none;
  width: 3.25rem;
  height: 3.25rem;
  border-radius: 999px;
  object-fit: cover;
  object-position: center 20%;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.25);
}
.avatar.blank {
  display: grid;
  place-items: center;
  font-size: 1.4rem;
}
.slot-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.slot-name {
  font-weight: 800;
  font-style: italic;
  overflow-wrap: anywhere;
}
.live-tag {
  margin-left: 0.35rem;
  padding: 0 0.4rem;
  border: 1px solid var(--accent);
  border-radius: 0.3rem;
  font-size: 0.7rem;
  font-style: normal;
  vertical-align: middle;
  color: #ffd2da;
  text-shadow: 0 0 4px var(--accent);
  box-shadow: 0 0 6px var(--accent);
}
.slot-time {
  font-size: 0.9rem;
  font-weight: 700;
  color: #ffd2da;
}
.slot-note {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.7);
}
.modal-actions {
  margin-top: 1rem;
  display: flex;
  justify-content: flex-end;
}
.close-btn {
  padding: 0.5rem 1.25rem;
  border-radius: 999px;
  border: 1px solid var(--accent);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 0 6px color-mix(in srgb, var(--accent) 60%, transparent);
}
.close-btn:hover,
.close-btn:focus-visible {
  background: color-mix(in srgb, var(--accent) 25%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  a.link:hover img {
    transform: none;
  }
}
</style>

<style>
/*
 * The day popup's panel. Unscoped because AppModal renders it; the attribute selector
 * outweighs the panel's own `bg-white`, whichever order the stylesheets load in.
 */
.dj-modal[role='dialog'] {
  --dj-modal-base: #120407;
  color: #fff;
  background:
    linear-gradient(180deg, rgba(18, 4, 7, 0.78) 0%, rgba(18, 4, 7, 0.92) 100%),
    var(--dj-modal-image, none) center top / cover no-repeat,
    radial-gradient(90% 60% at 70% 0%, rgba(255, 30, 40, 0.45) 0%, transparent 70%),
    var(--dj-modal-base);
  border: 1px solid color-mix(in srgb, var(--accent, #ff2a4f) 55%, transparent);
  box-shadow:
    0 0 1.5rem color-mix(in srgb, var(--accent, #ff2a4f) 35%, transparent),
    0 1.5rem 3rem rgba(0, 0, 0, 0.6);
}
.dj-modal[role='dialog'] > h2 {
  font-style: italic;
  font-weight: 900;
  text-shadow: 0 0 8px var(--accent, #ff2a4f);
}
</style>
