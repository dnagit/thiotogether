<script setup lang="ts">
/**
 * A list of achievements under a heading — a trophy room, a list of credits, any run of
 * one-line entries.
 *
 * Each line may carry its own uploaded icon. A line without one still gets a marker: an
 * entry that simply started further left than its neighbours would read as a mistake, so
 * the dash holds the place the icon would have taken and the column of text stays straight.
 */
import { computed, ref } from 'vue';

interface Entry {
  icon?: string;
  text?: string;
  /** `group` turns the row into a heading for the rows that follow it. */
  kind?: 'entry' | 'group';
  /** The short label this group gets on the timeline — a year, usually. Group rows only. */
  year?: string;
}

const props = withDefaults(
  defineProps<{
    heading?: string;
    entries?: Entry[];
    /** Centred matches the reference sheet; left reads better for a long list. */
    align?: 'center' | 'left';
    /** The rail of group markers down the right. Needs at least two groups to be worth it. */
    showTimeline?: boolean;
    headingColor?: string;
    textColor?: string;
    background?: string;
    /** Empty follows the text colour, which is the only value that works on any background. */
    railColor?: string;
    starColor?: string;
  }>(),
  {
    heading: '',
    entries: () => [],
    align: 'center',
    showTimeline: true,
    headingColor: '',
    textColor: '',
    background: '',
    railColor: '',
    starColor: '#f4b400',
  },
);

/** Ties each section to the rail marker that scrolls to it. */
const uid = `trophy-${Math.random().toString(36).slice(2, 9)}`;

const rows = computed(() => props.entries.filter((e) => e?.text || e?.icon));

/**
 * The flat list of rows, folded into the sections it describes.
 *
 * Groups are marked on the rows themselves rather than nested under them: the props editor
 * only nests one list deep, so a list of groups each holding a list of entries is not
 * something an editor could fill in. A row set to "group heading" opens a section and every
 * row after it belongs to that section, which is also the order they are typed in.
 *
 * Rows that arrive before any heading form a section of their own with no title, so a list
 * that never uses groups renders exactly as it did before groups existed.
 */
const sections = computed(() => {
  const out: { heading: Entry | null; items: Entry[] }[] = [];
  for (const row of rows.value) {
    if (row.kind === 'group') {
      out.push({ heading: row, items: [] });
      continue;
    }
    if (!out.length) out.push({ heading: null, items: [] });
    out[out.length - 1].items.push(row);
  }
  return out;
});

/**
 * The rail's markers: one per section that has a heading, named after that heading.
 *
 * Sections before the first heading have nothing to point at and are skipped rather than
 * given a blank marker.
 */
const marks = computed(() =>
  sections.value
    .map((s, index) => ({ index, heading: s.heading }))
    .filter((m) => m.heading)
    .map((m) => ({ index: m.index, label: (m.heading?.text ?? '').trim() })),
);

const hasTimeline = computed(() => props.showTimeline && marks.value.length > 1);

/**
 * Which marker wears the star: the one last chosen, not the one the page happens to be over.
 *
 * The rail is navigation here rather than a progress bar — nothing watches the scroll, so
 * there is no listener measuring the list on every frame, and the star stays where it was put
 * instead of drifting while the page moves.
 */
const activeMark = ref(0);

/** Clicking a name takes you to its section — the rail is navigation, not decoration. */
function goToSection(mark: number, index: number): void {
  activeMark.value = mark;
  const el = document.getElementById(`${uid}-s${index}`);
  if (!el) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
}

/**
 * The block's colours, as custom properties the stylesheet reads.
 *
 * The rail falls back to `currentColor` rather than to a fixed colour: it was white, which
 * is invisible the moment the background is set to white — a trap the editor only finds
 * after saving. Following the text means it is legible against whatever the block is sitting
 * on, since the text has to be legible there too.
 *
 * A colour that was picked deliberately is left at full strength; a derived one is dropped
 * to a tint, so the rail stays a quiet track behind the markers instead of a bar of body
 * text running down the page.
 */
const shell = computed(() => ({
  '--heading': props.headingColor || 'inherit',
  '--ink': props.textColor || 'inherit',
  '--rail': props.railColor || 'currentColor',
  '--rail-line-opacity': props.railColor ? '0.9' : '0.25',
  '--star': props.starColor,
  ...(props.background ? { background: props.background } : {}),
}));
</script>

<template>
  <section class="wrap" :style="shell">
    <div class="container-site inner">
      <h2 v-if="heading" class="heading">{{ heading }}</h2>

      <div class="layout" :class="{ 'has-rail': hasTimeline }">
      <div v-if="sections.length" class="sections" :class="`align-${align}`">
        <section v-for="(s, si) in sections" :id="`${uid}-s${si}`" :key="si">
          <!--
            A group heading gets its icon if there is one and nothing if there is not: the
            dash below stands in for a missing marker in a column of entries, and a title is
            not part of that column.
          -->
          <h3 v-if="s.heading" class="group">
            <img v-if="s.heading.icon" :src="s.heading.icon" alt="" loading="lazy" />
            <span>{{ s.heading.text }}</span>
          </h3>

          <ul v-if="s.items.length" class="list" role="list">
            <li v-for="(e, i) in s.items" :key="i">
              <span class="mark">
                <img v-if="e.icon" :src="e.icon" alt="" loading="lazy" />
                <!-- The stand-in for a missing icon: decoration, so it is hidden from readers. -->
                <span v-else class="dash" aria-hidden="true">–</span>
              </span>
              <span class="text">{{ e.text }}</span>
            </li>
          </ul>
        </section>
      </div>

      <!--
        The rail. Its markers are the group headings, and the star slides down it with the
        page — see the note on `progress`. Hidden below the breakpoint: a rail needs a column
        of its own to stand in, and on a phone that column would cost the list a third of its
        width to say what the headings in it already say.
      -->
      <nav v-if="hasTimeline" class="rail" aria-label="ไทม์ไลน์">
        <div class="rail-inner">
        <span class="line" aria-hidden="true"></span>

        <ul role="list">
          <li v-for="(m, mi) in marks" :key="mi">
            <button
              type="button"
              :class="{ on: mi === activeMark }"
              :aria-current="mi === activeMark"
              @click="goToSection(mi, m.index)"
            >
              <span class="mark-label">{{ m.label }}</span>
              <!--
                The star sits on the chosen marker rather than floating at a measured
                position: it is then always exactly on a dot, at any rail height, with no
                arithmetic to get wrong.
              -->
              <span v-if="mi === activeMark" class="star" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path
                    d="M12 2.5l2.9 6.1 6.6.9-4.8 4.7 1.2 6.7L12 17.6 6.1 20.9l1.2-6.7L2.5 9.5l6.6-.9z"
                    fill="currentColor"
                  />
                </svg>
              </span>
              <span v-else class="dot" aria-hidden="true"></span>
            </button>
          </li>
        </ul>
        </div>
      </nav>
      </div>
    </div>
  </section>
</template>

<style scoped>
.wrap {
  padding: clamp(1.5rem, 4vw, 3.5rem) 0;
  color: var(--ink);
}
.inner {
  padding-inline: 1rem;
}

.heading {
  margin: 0 0 clamp(1.25rem, 3vw, 2.25rem);
  text-align: center;
  font-weight: 800;
  line-height: 1.25;
  font-size: clamp(1.35rem, 3vw, 2.25rem);
  color: var(--heading);
  text-wrap: balance;
}

/*
 * The rail hangs off the right edge rather than taking a column of the grid.
 *
 * As a column it pushed the list into the space left over, so the writing sat off-centre on
 * the page while the block's own heading stayed centred — two centres, and the eye reads the
 * mismatch as a mistake. Floated, the list keeps the full width and its own centre, and the
 * rail sits in the margin the list's `max-width` was already leaving empty.
 */
.layout {
  position: relative;
}

.sections {
  max-width: 46rem;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: clamp(1rem, 2.5vw, 1.75rem);
}

/* ── Timeline rail ───────────────────────────────────────────────────────── */
.rail {
  display: none;
}
/*
 * From 1024px there is margin either side of the 46rem list for the rail to stand in without
 * touching it. Below that the rail is dropped: it would either overlap the writing or push it
 * off-centre, and the group headings in the list already say what the rail says.
 */
@media (min-width: 1024px) {
  .rail {
    display: block;
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 9rem;
  }
}
/*
 * Wider once there is room for it. At 1024px the margin beside the list is 9rem exactly, so
 * the rail fits and no more; past 1400px it can take the space that opens up and stop
 * wrapping every name onto two lines.
 */
@media (min-width: 1400px) {
  .rail {
    width: 12rem;
  }
}
/*
 * Exactly as tall as the list beside it — `.rail` is pinned to the block's own top and
 * bottom, and this fills it.
 *
 * It used to be a screen tall and sticky, which is only ever right when the list is longer
 * than the window. On a short list the markers were spread down 70vh of nothing and spilled
 * out of the block onto whatever came next. Tied to the content, the rail cannot outgrow the
 * thing it belongs to at any length.
 */
.rail-inner {
  height: 100%;
}
.rail ul {
  list-style: none;
  margin: 0;
  padding: 0;
  /*
   * `min-height` rather than `height`: the markers are spread down the rail, but a block with
   * more names than height has to be allowed to grow instead of stacking them on top of one
   * another.
   */
  min-height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.75rem;
}
/* The line runs behind the markers, from the first dot to the last. */
.line {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0.45rem;
  width: 0.35rem;
  border-radius: 999px;
  background: var(--rail);
  opacity: var(--rail-line-opacity);
}

.rail button {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.6rem;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  cursor: pointer;
  font: inherit;
}
/*
 * Two lines at most. A section's name is as long as it is, and one that runs on would either
 * push the rail into the writing or turn the column into a paragraph of its own.
 */
.mark-label {
  font-weight: 600;
  font-size: clamp(0.75rem, 0.95vw, 0.9rem);
  line-height: 1.35;
  text-align: right;
  opacity: 0.65;
  transition: opacity 0.2s ease;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.rail button.on .mark-label {
  opacity: 1;
}
.dot {
  width: 0.9rem;
  height: 0.9rem;
  border-radius: 50%;
  background: var(--rail);
  flex: none;
  /* Centres the dot on the line: half the dot, less half the line's width. */
  margin-right: 0.175rem;
  transition: transform 0.2s ease;
}
.rail button.on .dot {
  transform: scale(1.25);
}
.rail button:focus-visible {
  outline: 3px solid var(--star);
  outline-offset: 3px;
  border-radius: 0.5rem;
}

/* Sized to sit where a dot would, and centred on the line the same way. */
.star {
  width: 1.6rem;
  height: 1.6rem;
  margin-right: -0.175rem;
  color: var(--star);
  flex: none;
  display: grid;
  place-items: center;
}
.star svg {
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 1px 3px rgb(0 0 0 / 25%));
}

@media (prefers-reduced-motion: reduce) {
  .star,
  .dot,
  .mark-label {
    transition: none;
  }
}

/* Set apart from the entries under it, and closer to them than to the section before. */
.group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 clamp(0.4rem, 1.2vw, 0.7rem);
  font-weight: 700;
  line-height: 1.4;
  font-size: clamp(1rem, 1.5vw, 1.2rem);
}
.group img {
  width: 1.4em;
  height: 1.4em;
  object-fit: contain;
  flex: none;
}
.align-center .group {
  justify-content: center;
  text-align: center;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: clamp(0.35rem, 1vw, 0.6rem);
  font-size: clamp(0.9rem, 1.15vw, 1.05rem);
  line-height: 1.7;
}

/*
 * Each row is icon-then-text, and the icon column is fixed at its own width. A wrapped line
 * then runs under the text rather than under the marker, which is what keeps a long entry
 * looking like one entry.
 */
.list li {
  display: grid;
  gap: 0.5rem;
  align-items: start;
}

/*
 * Centred: the text column is sized to the words in it — `max-content`, capped at the width
 * available so a long entry still wraps — which leaves slack either side for the row to be
 * centred in. At `1fr` there is no slack: the column fills the line, the marker is pinned to
 * the far left, and centring the text only floats it away from its own marker.
 */
.align-center li {
  grid-template-columns: auto minmax(0, max-content);
  justify-content: center;
  text-align: center;
}

/* Ranged left: the text takes the rest of the line, so wrapped lines share one left edge. */
.align-left li {
  grid-template-columns: auto minmax(0, 1fr);
  justify-content: start;
  text-align: left;
}

.mark {
  display: grid;
  place-items: center;
  width: 1.4em;
  height: 1.4em;
  flex: none;
}
.mark img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.dash {
  opacity: 0.55;
}

.text {
  overflow-wrap: anywhere;
}
</style>
