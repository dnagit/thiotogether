<script setup lang="ts">
/**
 * One round's results as a game-style leaderboard: a podium for the top three, the full
 * table under it, and a tab bar along the bottom to switch between the awards.
 *
 *  - Streaming Star and Rising Streamer are rankings, so they get the podium and medals.
 *    Tied scores share a place (1, 1, 3…), and a tie shares the medal too.
 *  - DJ's Pick is luck, not a ranking — no podium, no places; the table lists the winners
 *    with the DJ who drew them.
 *
 * What a winner drew shows under their name once they have drawn it.
 */
import { computed, ref } from 'vue';
import type { StreamAwards } from '@cms/shared';
import RankMedal from './RankMedal.vue';

const props = withDefaults(
  defineProps<{ awards: StreamAwards; showCounts?: boolean; dim?: boolean }>(),
  { showCounts: true, dim: false },
);

type Tab = 'star' | 'rising' | 'pick';
const tab = ref<Tab>('star');

const TABS: Array<{ key: Tab; icon: string; label: string; title: string }> = [
  { key: 'star', icon: '🏆', label: 'Streaming Star', title: 'Streaming Star' },
  { key: 'rising', icon: '🔥', label: 'Rising', title: 'Rising Streamer' },
  { key: 'pick', icon: '🎧', label: "DJ's Pick", title: "DJ's Pick" },
];
const current = computed(() => TABS.find((t) => t.key === tab.value)!);

const num = (n: number) => n.toLocaleString('th-TH');

interface Row {
  xAccount: string;
  /** Shared by ties; null for DJ's Pick, which has no places. */
  rank: number | null;
  score: string;
  sub: string | null;
  prize: string | null;
  /** Rising Streamer only: the one who takes the award; the rest is a leaderboard. */
  winner?: boolean;
}

const prizeOf = computed(() => {
  const byAccount = new Map<string, string>();
  for (const d of props.awards.draws) byAccount.set(d.xAccount.toLowerCase(), d.prize.name);
  return (xAccount: string) => byAccount.get(xAccount.toLowerCase()) ?? null;
});

/** Competition ranking: the same value, the same place, and the next place skips ahead. */
function ranked<T>(items: T[], value: (item: T) => number | string): Array<T & { rank: number }> {
  return items.map((item, i) => {
    let first = i;
    while (first > 0 && value(items[first - 1]) === value(item)) first--;
    return { ...item, rank: first + 1 };
  });
}

const rows = computed<Row[]>(() => {
  const a = props.awards;
  if (tab.value === 'star') {
    return ranked(a.stars, (r) => r.streams).map((r) => ({
      xAccount: r.xAccount,
      rank: r.rank,
      score: num(r.streams),
      sub: null,
      prize: prizeOf.value(r.xAccount),
    }));
  }
  if (tab.value === 'rising') {
    // Ranked the way the winner is chosen: the rise, then this round's total.
    return ranked(a.rising, (r) => `${r.gain}|${r.streams}`).map((r) => ({
      xAccount: r.xAccount,
      rank: r.rank,
      winner: r.winner,
      score: `+${num(r.gain)}`,
      // With no round before, everyone starts from 0 and "new" would say nothing.
      sub: !a.previous ? null : r.previous ? `${num(r.previous)} → ${num(r.streams)}` : 'ใหม่รอบนี้ ✨',
      prize: prizeOf.value(r.xAccount),
    }));
  }
  return a.picks.map((p) => ({
    xAccount: p.xAccount,
    rank: null,
    score: p.dj ? p.dj.name : '–',
    sub: null,
    prize: prizeOf.value(p.xAccount),
  }));
});

const scoreHeading = computed(() =>
  tab.value === 'star' ? 'ยอดสตรีม' : tab.value === 'rising' ? 'เพิ่มขึ้น' : 'DJ',
);
const showScore = computed(() => props.showCounts || tab.value === 'pick');

/** Second, first, third — left to right, as a podium stands. */
const podium = computed(() => {
  if (tab.value === 'pick') return [];
  const [first, second, third] = rows.value;
  return [
    { place: 2, row: second ?? null },
    { place: 1, row: first ?? null },
    { place: 3, row: third ?? null },
  ];
});

const medalFor = (rank: number | null) => (rank && rank <= 3 ? (rank as 1 | 2 | 3) : null);

/** Rising Streamer's list runs past its winners, and only the winners get medals. */
const rowMedal = (r: Row) => (tab.value === 'rising' && !r.winner ? null : medalFor(r.rank));

/** Each award has its own number of winners, set on the round. */
const winnerCount = computed(() =>
  tab.value === 'star'
    ? props.awards.starCount
    : tab.value === 'rising'
      ? props.awards.risingCount
      : props.awards.pickCount,
);

const emptyText = computed(() => {
  if (tab.value === 'pick') return 'รอ DJ สุ่มผู้โชคดีอยู่นะ';
  return 'รอผลอยู่นะ';
});

const provisional = computed(() => props.awards.session.isOpen && tab.value !== 'pick' && rows.value.length > 0);

const subtitle = computed(() => {
  if (tab.value === 'star') return 'ยอดสตรีมสูงสุดของรอบ';
  if (tab.value === 'rising') {
    return props.awards.previous
      ? `ยอดเพิ่มขึ้นจาก ${props.awards.previous.name} มากที่สุด`
      : 'รอบแรก ยังไม่มีรอบก่อนให้เทียบ — ดูจากยอดรอบนี้';
  }
  return `DJ สุ่มจากคนที่ส่งยอด ${props.awards.participants} คน — ให้สิทธิ์คนที่ยังไม่ได้รางวัลก่อน`;
});

/** Falling light streaks behind the podium; fixed positions so the page never jumps. */
const streaks = Array.from({ length: 22 }, (_, i) => ({
  left: `${(i * 37 + 11) % 100}%`,
  top: `${(i * 53) % 70}%`,
  height: `${1.2 + ((i * 7) % 5) * 0.4}rem`,
  delay: `${((i * 13) % 20) / 10}s`,
  duration: `${2.4 + ((i * 11) % 10) / 5}s`,
}));
</script>

<template>
  <div class="board" :class="{ dim }">
    <div class="sky" aria-hidden="true">
      <span
        v-for="(s, i) in streaks"
        :key="i"
        class="streak"
        :style="{ left: s.left, top: s.top, height: s.height, animationDelay: s.delay, animationDuration: s.duration }"
      />
    </div>

    <header class="title">
      <RankMedal v-if="tab === 'star'" :rank="1" size="3.4rem" />
      <span v-else class="title-icon" aria-hidden="true">{{ current.icon }}</span>
      <div>
        <h3 :id="`award-${tab}`">{{ current.title }}</h3>
        <p>
          {{ subtitle }}
          <span class="nowrap">· ผู้ชนะ {{ winnerCount }} คน</span>
        </p>
      </div>
    </header>
    <p v-if="provisional" class="provisional">อันดับชั่วคราว · ประกาศผลเมื่อปิดรอบ</p>

    <div role="tabpanel" :aria-labelledby="`award-${tab}`">
      <!-- Podium -->
      <div v-if="podium.length" class="podium">
        <svg class="triangle" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
          <polygon points="50,2 98,58 2,58" />
        </svg>
        <div v-for="p in podium" :key="p.place" class="step" :class="`place-${p.place}`">
          <div class="who">
            <template v-if="p.row">
              <span v-if="p.place === 1" class="crown" aria-hidden="true">👑</span>
              <span class="avatar" :class="`ring-${medalFor(p.row.rank) ?? 3}`" aria-hidden="true">
                {{ p.row.xAccount.charAt(0).toUpperCase() }}
              </span>
              <span class="who-name">@{{ p.row.xAccount }}</span>
            </template>
          </div>
          <div class="pedestal" :class="`metal-${p.row ? (medalFor(p.row.rank) ?? 3) : p.place}`">
            <span class="block-num" aria-hidden="true">{{ p.row?.rank ?? p.place }}</span>
          </div>
        </div>
      </div>

      <!-- DJ's Pick has no places; a big badge stands in for the podium. -->
      <div v-else class="pick-hero" aria-hidden="true">
        <span class="pick-disc">🎧</span>
      </div>

      <!-- Table -->
      <div class="board-table">
        <div class="thead" :class="{ 'no-score': !showScore }">
          <span>{{ tab === 'pick' ? '' : 'ลำดับ' }}</span>
          <span>ชื่อ</span>
          <span v-if="showScore">{{ scoreHeading }}</span>
        </div>

        <ol v-if="rows.length" class="rows">
          <li
            v-for="(r, i) in rows"
            :key="`${tab}-${r.xAccount}`"
            class="row"
            :class="[rowMedal(r) ? `metal-row-${rowMedal(r)}` : 'plain', { 'no-score': !showScore }]"
            :style="{ animationDelay: `${Math.min(i, 8) * 60}ms` }"
          >
            <span class="rank">
              <RankMedal v-if="rowMedal(r)" :rank="rowMedal(r)!" size="3.1rem" />
              <span v-else-if="r.rank" class="rank-num">{{ r.rank }}</span>
              <span v-else class="rank-num" aria-hidden="true">🎁</span>
              <span class="sr-only">{{ r.rank ? `อันดับ ${r.rank}` : '' }}</span>
            </span>
            <span class="name">
              <span class="acc">@{{ r.xAccount }}</span>
              <small v-if="r.winner" class="champ">🏆 ผู้ชนะ</small>
              <small v-if="r.sub" class="sub">{{ r.sub }}</small>
              <small v-if="r.prize" class="prize">🎁 {{ r.prize }}</small>
            </span>
            <span v-if="showScore" class="score">{{ r.score }}</span>
          </li>
        </ol>
        <p v-else class="empty">{{ emptyText }}</p>
      </div>
    </div>

    <!-- Award switcher -->
    <nav class="tabs" role="tablist" aria-label="เลือกรางวัล">
      <button
        v-for="t in TABS"
        :key="t.key"
        type="button"
        role="tab"
        class="tab"
        :class="{ active: tab === t.key }"
        :aria-selected="tab === t.key"
        @click="tab = t.key"
      >
        <span class="tab-icon" aria-hidden="true">{{ t.icon }}</span>
        <span class="tab-label">{{ t.label }}</span>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.board {
  --red: #b10f24;
  position: relative;
  overflow: hidden;
  max-width: 34rem;
  margin: 1rem auto 0;
  border-radius: 1.5rem;
  color: #fff;
  background:
    radial-gradient(ellipse 80% 45% at 50% 30%, #de2b45 0%, transparent 70%),
    linear-gradient(180deg, #a80c20 0%, var(--red) 45%, #8f0a1b 100%);
  box-shadow: 0 12px 30px rgb(120 10 25 / 0.35);
  transition: opacity 0.2s;
}
.board.dim {
  opacity: 0.6;
}

/* ── Background ── */
.sky {
  position: absolute;
  inset: 0 0 auto;
  height: 22rem;
  pointer-events: none;
}
.streak {
  position: absolute;
  width: 2px;
  border-radius: 2px;
  background: linear-gradient(transparent, rgb(255 190 200 / 0.55), transparent);
  animation: fall linear infinite;
}
@keyframes fall {
  from { transform: translateY(-1.5rem); opacity: 0; }
  30% { opacity: 1; }
  to { transform: translateY(3rem); opacity: 0; }
}
.triangle {
  position: absolute;
  left: 6%;
  bottom: 0;
  width: 88%;
  height: 85%;
  pointer-events: none;
}
.triangle polygon {
  fill: none;
  stroke: rgb(255 255 255 / 0.28);
  vector-effect: non-scaling-stroke;
  stroke-width: 2.5px;
}

/* ── Title ── */
.title {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.1rem 1.25rem 0;
}
.title h3 {
  margin: 0;
  font-size: clamp(1.6rem, 6vw, 2.2rem);
  font-weight: 800;
  line-height: 1.1;
  color: #fffbeb;
  text-shadow: 0 2px 0 rgb(0 0 0 / 0.2);
}
.title p {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  color: rgb(255 255 255 / 0.8);
}
.title-icon {
  display: grid;
  place-items: center;
  flex: 0 0 3.4rem;
  height: 3.4rem;
  border-radius: 999px;
  font-size: 1.9rem;
  background: radial-gradient(circle at 35% 30%, #fff7d6, #fbbf24 60%, #b45309);
  box-shadow: 0 2px 4px rgb(0 0 0 / 0.25);
}
.nowrap {
  white-space: nowrap;
}
.provisional {
  position: relative;
  margin: 0.6rem 1.25rem 0;
  display: inline-block;
  padding: 0.15rem 0.7rem;
  border-radius: 999px;
  font-size: 0.75rem;
  background: rgb(255 255 255 / 0.18);
}

/* ── Podium ── */
.podium {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1.25fr 1fr;
  align-items: end;
  padding: 1rem 1.25rem 0;
  min-height: 15.5rem;
}
.step {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}
.who {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  margin-bottom: 0.4rem;
  min-height: 1rem;
  max-width: 100%;
}
.crown {
  font-size: 1.4rem;
  line-height: 1;
  margin-bottom: -0.35rem;
  position: relative;
  z-index: 1;
}
.avatar {
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border-radius: 999px;
  font-weight: 800;
  font-size: 1.3rem;
  color: #7c2d12;
  background: #fff7ed;
  border: 3px solid;
  box-shadow: 0 2px 4px rgb(0 0 0 / 0.3);
}
.place-1 .avatar {
  width: 3.6rem;
  height: 3.6rem;
  font-size: 1.6rem;
}
.ring-1 { border-color: #fbbf24; }
.ring-2 { border-color: #cbd5e1; }
.ring-3 { border-color: #f59e5b; }
.who-name {
  max-width: 100%;
  padding: 0 0.25rem;
  font-weight: 700;
  font-size: 0.85rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 1px 2px rgb(0 0 0 / 0.4);
}
.pedestal {
  position: relative;
  width: 100%;
  display: grid;
  place-items: center;
  border-radius: 0.9rem 0.9rem 0.3rem 0.3rem;
  /* A lighter lip along the top and a shaded right side give the block its depth. */
  box-shadow:
    inset 0 0.7rem 0 rgb(255 255 255 / 0.28),
    inset -0.6rem 0 0 rgb(0 0 0 / 0.12),
    0 6px 10px rgb(0 0 0 / 0.25);
}
.pedestal::after {
  content: '';
  position: absolute;
  top: 0.25rem;
  left: 0.7rem;
  width: 1.1rem;
  height: 0.3rem;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.55);
  transform: rotate(-12deg);
}
.place-1 .pedestal { height: 8.5rem; margin: 0 -0.15rem; z-index: 1; }
.place-2 .pedestal { height: 5.8rem; }
.place-3 .pedestal { height: 4.8rem; }
.metal-1 { background: linear-gradient(135deg, #fde047 0%, #facc15 45%, #eab308 100%); }
.metal-2 { background: linear-gradient(135deg, #d1d5db 0%, #a8adb4 55%, #8b9098 100%); }
.metal-3 { background: linear-gradient(135deg, #fb923c 0%, #ea6c14 55%, #c2410c 100%); }
.block-num {
  font-size: clamp(2.4rem, 9vw, 3.4rem);
  font-weight: 900;
  line-height: 1;
  color: rgb(0 0 0 / 0.18);
}

.pick-hero {
  position: relative;
  display: grid;
  place-items: center;
  padding: 1.5rem 0 1rem;
}
.pick-disc {
  display: grid;
  place-items: center;
  width: 7rem;
  height: 7rem;
  border-radius: 999px;
  font-size: 3.6rem;
  background: radial-gradient(circle at 35% 30%, #fff7d6, #fbbf24 55%, #b45309);
  box-shadow: 0 0 0 0.5rem rgb(255 255 255 / 0.15), 0 10px 20px rgb(0 0 0 / 0.3);
}

/* ── Table ── */
.board-table {
  position: relative;
  padding: 0 0.6rem 1rem;
}
.thead,
.row {
  display: grid;
  grid-template-columns: 4.2rem minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 0.6rem;
}
.thead.no-score,
.row.no-score {
  grid-template-columns: 4.2rem minmax(0, 1fr);
}
.thead {
  padding: 0.85rem 1.4rem 0.85rem 0.8rem;
  border-radius: 999px;
  background: rgb(45 8 18 / 0.88);
  font-weight: 800;
  font-size: 1.05rem;
}
.thead span:first-child {
  text-align: center;
}
.thead span:last-child:not(:nth-child(2)) {
  text-align: right;
}
.rows {
  list-style: none;
  margin: 0.55rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}
.row {
  min-height: 3.6rem;
  padding: 0.3rem 1.4rem 0.3rem 0.5rem;
  border-radius: 999px;
  animation: rise 0.35s ease-out both;
}
@keyframes rise {
  from { opacity: 0; transform: translateY(0.5rem); }
}
.metal-row-1 { background: linear-gradient(90deg, #fcd34d, #e0a91f 60%, #ca8a04); color: #3b1d06; }
.metal-row-2 { background: linear-gradient(90deg, #dcdcd5, #b3ada1 60%, #857e6e); color: #1f1d1a; }
.metal-row-3 { background: linear-gradient(90deg, #fb923c, #e0701f 60%, #c2410c); color: #fff; }
.plain { background: #f7f5ec; color: #4a0d18; }
.rank {
  display: grid;
  place-items: center;
  /* The medal rides a little above the pill, as in a trophy table. */
  margin-top: -0.6rem;
}
.rank-num {
  margin-top: 0.6rem;
  font-size: 1.5rem;
  font-weight: 900;
  color: #a10d22;
}
.name {
  display: grid;
  min-width: 0;
}
.acc {
  font-weight: 800;
  font-size: 1.02rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.champ {
  justify-self: start;
  margin: 0.1rem 0;
  padding: 0.05rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 800;
  color: #fff;
  background: #a10d22;
}
.sub,
.prize {
  font-size: 0.78rem;
  opacity: 0.85;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.prize {
  font-weight: 700;
  opacity: 1;
}
.score {
  font-weight: 900;
  font-size: 1.1rem;
  font-variant-numeric: tabular-nums;
  text-align: right;
  max-width: 9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.empty {
  margin: 0.55rem 0 0;
  padding: 1rem;
  border-radius: 999px;
  text-align: center;
  background: #f7f5ec;
  color: #7a2130;
  font-weight: 700;
}

/* ── Tab bar ── */
.tabs {
  position: relative;
  display: flex;
  justify-content: center;
  gap: 0.6rem;
  padding: 0.9rem 0.75rem 1rem;
  background: linear-gradient(180deg, #4a0b16, #2d0710);
  border-top: 1px solid rgb(255 255 255 / 0.1);
}
.tab {
  position: relative;
  flex: 1 1 0;
  max-width: 7rem;
  display: grid;
  justify-items: center;
  gap: 0.15rem;
  padding: 0.55rem 0.3rem 0.45rem;
  border-radius: 0.8rem;
  color: rgb(255 255 255 / 0.85);
  background: linear-gradient(180deg, #6b1827, #4a0f1b);
  border: 1px solid rgb(255 255 255 / 0.14);
  box-shadow: 0 3px 0 rgb(0 0 0 / 0.35);
  transition: transform 0.15s, background 0.15s;
}
.tab:hover {
  transform: translateY(-2px);
}
.tab:focus-visible {
  outline: 2px solid #fde68a;
  outline-offset: 2px;
}
.tab-icon {
  font-size: 1.6rem;
  line-height: 1;
}
.tab-label {
  font-size: 0.72rem;
  font-weight: 700;
  white-space: nowrap;
}
.tab.active {
  color: #3b1d06;
  background: linear-gradient(180deg, #fff1a8, #fbbf24 70%, #e59a0b);
  border-color: #fff7d6;
  transform: translateY(-4px);
  box-shadow: 0 4px 0 #a16207, 0 0 14px rgb(251 191 36 / 0.5);
}
/* The little pointer over the chosen tab. */
.tab.active::before {
  content: '';
  position: absolute;
  top: -0.55rem;
  left: 50%;
  translate: -50% 0;
  border: 0.35rem solid transparent;
  border-bottom-color: #fff7d6;
}

@media (prefers-reduced-motion: reduce) {
  .streak,
  .row {
    animation: none;
  }
}
</style>
