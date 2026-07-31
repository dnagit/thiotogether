<script setup lang="ts">
/** Public game index. Draft games are never returned by the API, so nothing to filter here. */
import { computed, ref } from 'vue';
import { get } from '@/api/client';
import { applySeo } from '@/composables/useSeo';

interface GameCard {
  name: string;
  slug: string;
  description: string | null;
  coverImage: string | null;
  status: 'OPEN' | 'FULL' | 'REVEALED';
  tileCount: number;
  tokensPerTile: number;
  themeColor: string | null;
  reservedCount: number;
  revealedAt: string | null;
}

const games = ref<GameCard[]>([]);
const loading = ref(true);
const error = ref(false);

applySeo({ title: 'เกมเปิดแผ่นป้าย' });

void get<GameCard[]>('/games')
  .then((g) => (games.value = g))
  .catch(() => (error.value = true))
  .finally(() => (loading.value = false));

const badge: Record<string, { text: string; cls: string }> = {
  OPEN: { text: '🎯 เปิดให้จอง', cls: 'badge-open' },
  FULL: { text: '⏳ รอประกาศผล', cls: 'badge-full' },
  REVEALED: { text: '🎉 ประกาศผลแล้ว', cls: 'badge-revealed' },
};

function linkFor(g: GameCard): string {
  return g.status === 'REVEALED' ? `/game/${g.slug}/results` : `/game/${g.slug}`;
}
const hasGames = computed(() => games.value.length > 0);
</script>

<template>
  <div class="font-sukhumvit container-site py-12">
    <header class="text-center mb-10">
      <h1 class="text-3xl sm:text-4xl font-extrabold mb-2">เกมเปิดแผ่นป้าย</h1>
      <p class="text-gray-500">บริจาคเพื่อรับ Token แล้วเลือกเปิดแผ่นป้ายลุ้นรางวัล</p>
      <RouterLink to="/tokens" class="inline-block mt-3 text-blue-600 underline text-sm">
        ตรวจสอบ Token ของฉัน
      </RouterLink>
    </header>

    <div v-if="loading" class="py-16 text-center text-gray-400 animate-pulse" role="status">กำลังโหลด…</div>

    <div v-else-if="error" class="py-16 text-center">
      <div class="text-5xl mb-3" aria-hidden="true">⚠️</div>
      <p class="font-semibold mb-1">โหลดรายการเกมไม่สำเร็จ</p>
      <button type="button" class="text-blue-600 underline" @click="$router.go(0)">ลองใหม่</button>
    </div>

    <div v-else-if="!hasGames" class="py-16 text-center">
      <div class="text-5xl mb-3" aria-hidden="true">🎲</div>
      <p class="font-semibold mb-1">ยังไม่มีเกมที่เปิดให้เล่น</p>
      <p class="text-gray-500 text-sm">กลับมาใหม่อีกครั้งเร็ว ๆ นี้</p>
    </div>

    <ul v-else class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" role="list">
      <li v-for="g in games" :key="g.slug">
        <RouterLink
          :to="linkFor(g)"
          class="block h-full bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-lg transition overflow-hidden"
        >
          <img v-if="g.coverImage" :src="g.coverImage" :alt="g.name" loading="lazy" class="w-full h-44 object-cover" />
          <div
            v-else
            class="w-full h-44 flex items-center justify-center text-5xl"
            :style="{ background: g.themeColor ?? 'var(--color-primary)', opacity: 0.85 }"
            aria-hidden="true"
          >🎁</div>

          <div class="p-5">
            <span class="badge" :class="badge[g.status]?.cls">{{ badge[g.status]?.text ?? g.status }}</span>
            <h2 class="font-bold text-lg mt-2">{{ g.name }}</h2>
            <p v-if="g.description" class="text-sm text-gray-600 mt-1 line-clamp-2">{{ g.description }}</p>

            <div class="mt-4">
              <div class="flex justify-between text-xs text-gray-500 mb-1">
                <span>จองแล้ว {{ g.reservedCount }} จาก {{ g.tileCount }} ป้าย</span>
                <span>{{ Math.round((g.reservedCount / g.tileCount) * 100) }}%</span>
              </div>
              <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full"
                  :style="{ width: `${(g.reservedCount / g.tileCount) * 100}%`, background: g.themeColor ?? 'var(--color-primary)' }"
                />
              </div>
              <p class="text-xs text-gray-500 mt-2">ใช้ {{ g.tokensPerTile }} Token ต่อ 1 ป้าย</p>
            </div>
          </div>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.badge { @apply inline-block text-xs font-semibold px-2.5 py-1 rounded-full; }
.badge-open { @apply bg-emerald-100 text-emerald-800; }
.badge-full { @apply bg-amber-100 text-amber-800; }
.badge-revealed { @apply bg-violet-100 text-violet-800; }
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
