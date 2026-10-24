<script setup lang="ts">
/**
 * The field everyone shares: every plant in its plot, the countdown to the day they all open,
 * and how far the donations are from the next decoration.
 *
 * `?plant=<id>` opens that plant's card and brings it into view — the link a seed card copies,
 * and where "go to my plant" lands.
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { errorMessage, fetchField, fetchGarden, type Garden, type Plant } from '@/api/garden';
import { applySeo } from '@/composables/useSeo';
import GardenShell from '@/components/garden/GardenShell.vue';
import GardenField from '@/components/garden/GardenField.vue';
import PlantCardDialog from '@/components/garden/PlantCardDialog.vue';
import { clockOffset, countdown, thaiDate } from '@/components/garden/garden';

const route = useRoute();
const router = useRouter();
const slug = String(route.params.slug);

const garden = ref<Garden | null>(null);
const plants = ref<Plant[]>([]);
const loadError = ref<string | null>(null);
const loadingPlants = ref(true);

const now = ref(Date.now());
let offset = 0;
const tick = window.setInterval(() => (now.value = Date.now() + offset), 1000);
onBeforeUnmount(() => window.clearInterval(tick));

async function load(): Promise<void> {
  try {
    const g = await fetchGarden(slug);
    offset = clockOffset(g);
    now.value = Date.now() + offset;
    garden.value = g;
    applySeo({
      title: g.title,
      metaDescription: g.description ?? undefined,
      ogImage: g.coverImage ?? undefined,
    });
    plants.value = await fetchField(slug);
  } catch (err) {
    loadError.value = errorMessage(err, 'ไม่พบสวนนี้');
  } finally {
    loadingPlants.value = false;
  }
}
void load();

/**
 * When the countdown runs out on an open page, fetch again: the flowers only come with the
 * answer the server gives after the reveal.
 */
const left = computed(() => (garden.value ? countdown(garden.value.revealAt, now.value) : null));
let reloaded = false;
const unwatch = window.setInterval(() => {
  if (garden.value && !garden.value.revealed && left.value?.done && !reloaded) {
    reloaded = true;
    loadingPlants.value = true;
    void load();
  }
}, 2000);
onBeforeUnmount(() => window.clearInterval(unwatch));

const selectedId = computed(() => (route.query.plant ? Number(route.query.plant) : null));
const selected = computed(() => plants.value.find((p) => p.id === selectedId.value) ?? null);

function open(plant: Plant): void {
  void router.replace({ query: { ...route.query, plant: String(plant.id) } });
}
function close(): void {
  const { plant: _plant, ...rest } = route.query;
  void router.replace({ query: rest });
}

const next = computed(() => garden.value?.nextDecoration ?? null);
const nextPercent = computed(() => {
  const n = next.value;
  if (!n) return 100;
  if ('percent' in n) return n.percent;
  return Math.min(99, Math.floor((n.raised / n.unlockAmount) * 100));
});
const money = (n: number) => n.toLocaleString('th-TH');
</script>

<template>
  <GardenShell :slug="slug" :title="garden?.title" :theme-color="garden?.themeColor">
    <p v-if="loadError" class="panel center">{{ loadError }}</p>
    <div v-else-if="!garden" class="panel center muted">กำลังโหลด…</div>

    <template v-else>
      <header class="head">
        <div>
          <h1 class="title">{{ garden.title }}</h1>
          <p class="muted">
            ปลูกแล้ว {{ garden.plantCount.toLocaleString('th-TH') }} ต้น ·
            {{
              garden.revealed ? 'บานพร้อมกันแล้ว 🌻' : `บานพร้อมกัน ${thaiDate(garden.revealAt)}`
            }}
          </p>
        </div>
        <RouterLink v-if="garden.isOpen" :to="`/garden/plant/${slug}`" class="btn btn-main"
          >ปลูกต้นของคุณ 🌱</RouterLink
        >
      </header>

      <div v-if="!garden.revealed && left" class="countdown" aria-label="เวลาที่เหลือก่อนดอกบาน">
        <div>
          <b>{{ left.days }}</b
          ><span>วัน</span>
        </div>
        <div>
          <b>{{ left.hours }}</b
          ><span>ชั่วโมง</span>
        </div>
        <div>
          <b>{{ left.minutes }}</b
          ><span>นาที</span>
        </div>
        <div>
          <b>{{ left.seconds }}</b
          ><span>วินาที</span>
        </div>
      </div>

      <div v-if="next" class="unlock">
        <div class="unlock-text">
          ของตกแต่งชิ้นถัดไป: <b>{{ next.name }}</b>
          <span v-if="'raised' in next" class="muted">
            · {{ money(next.raised) }} / {{ money(next.unlockAmount) }} บาท</span
          >
        </div>
        <div class="unlock-bar"><span :style="{ width: `${nextPercent}%` }" /></div>
        <RouterLink
          v-if="garden.shelf.donationSlug"
          :to="`/donation/${garden.shelf.donationSlug}`"
          class="unlock-link"
        >
          ร่วมโดเนทเพื่อปลดล็อค →
        </RouterLink>
      </div>

      <div v-if="loadingPlants" class="panel center muted">กำลังพาไปที่แปลง…</div>
      <div v-else-if="!plants.length" class="panel center">
        ยังไม่มีใครปลูก
        <RouterLink v-if="garden.isOpen" :to="`/garden/plant/${slug}`" class="link"
          >เป็นคนแรกเลย</RouterLink
        >
      </div>
      <GardenField
        v-else
        :garden="garden"
        :plants="plants"
        :now="now"
        :highlight-id="selectedId"
        @select="open"
      />

      <p v-if="garden.revealed" class="center mt">
        <RouterLink :to="`/garden/cards/${slug}`" class="link">อ่านคำอธิษฐานทั้งหมด →</RouterLink>
      </p>
    </template>

    <PlantCardDialog
      v-if="garden && selectedId"
      :garden="garden"
      :plant-id="selectedId"
      :plant="selected"
      @close="close"
    />
  </GardenShell>
</template>

<style scoped>
.panel {
  background: rgb(255 255 255 / 0.92);
  border-radius: 18px;
  padding: 18px;
}
.center {
  text-align: center;
}
.muted {
  color: #6b7280;
}
.mt {
  margin-top: 14px;
}
.link {
  color: #b45309;
  font-weight: 700;
  text-decoration: underline;
  margin-left: 4px;
}
.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.title {
  font-size: 1.6rem;
  font-weight: 800;
  color: #92400e;
}
.btn {
  display: inline-flex;
  padding: 10px 16px;
  border-radius: 12px;
  font-weight: 700;
}
.btn-main {
  background: #f59e0b;
  color: #fff;
  border: 1px solid #d97706;
}
.countdown {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-bottom: 12px;
}
.countdown div {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 64px;
  padding: 8px 6px;
  border-radius: 14px;
  background: rgb(255 255 255 / 0.85);
}
.countdown b {
  font-size: 1.5rem;
  color: #b45309;
  line-height: 1.1;
}
.countdown span {
  font-size: 0.75rem;
  color: #6b7280;
}
.unlock {
  margin-bottom: 14px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgb(255 255 255 / 0.85);
}
.unlock-text {
  font-size: 0.9rem;
}
.unlock-bar {
  height: 10px;
  margin-top: 6px;
  border-radius: 999px;
  background: #fde68a;
  overflow: hidden;
}
.unlock-bar span {
  display: block;
  height: 100%;
  background: #f59e0b;
}
.unlock-link {
  display: inline-block;
  margin-top: 6px;
  font-size: 0.85rem;
  font-weight: 700;
  color: #b45309;
}
</style>
