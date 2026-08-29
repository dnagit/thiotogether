<script setup lang="ts">
/**
 * A list of achievements under a heading — a trophy room, a list of credits, any run of
 * one-line entries.
 *
 * Each line may carry its own uploaded icon. A line without one still gets a marker: an
 * entry that simply started further left than its neighbours would read as a mistake, so
 * the dash holds the place the icon would have taken and the column of text stays straight.
 */
import { computed } from 'vue';

interface Entry {
  icon?: string;
  text?: string;
  /** `group` turns the row into a heading for the rows that follow it. */
  kind?: 'entry' | 'group';
}

const props = withDefaults(
  defineProps<{
    heading?: string;
    entries?: Entry[];
    /** Centred matches the reference sheet; left reads better for a long list. */
    align?: 'center' | 'left';
    headingColor?: string;
    textColor?: string;
    background?: string;
  }>(),
  {
    heading: '',
    entries: () => [],
    align: 'center',
    headingColor: '',
    textColor: '',
    background: '',
  },
);

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

const shell = computed(() => ({
  '--heading': props.headingColor || 'inherit',
  '--ink': props.textColor || 'inherit',
  ...(props.background ? { background: props.background } : {}),
}));
</script>

<template>
  <section class="wrap" :style="shell">
    <div class="container-site inner">
      <h2 v-if="heading" class="heading">{{ heading }}</h2>

      <div v-if="sections.length" class="sections" :class="`align-${align}`">
        <section v-for="(s, si) in sections" :key="si">
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

.sections {
  max-width: 46rem;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: clamp(1rem, 2.5vw, 1.75rem);
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
