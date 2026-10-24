<script setup lang="ts">
/**
 * "My garden": every plant sown from this browser, and the one place secret fertiliser is put
 * on. Opened by the key the first seed handed this browser — or by a recovery link, which
 * carries the key in `#key=…`; it is stored and wiped from the address bar straight away, so
 * it does not linger in history or get copied along with the page link.
 */
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  errorMessage,
  fetchGarden,
  fetchMine,
  gardenerKey,
  recoveryLink,
  setGardenerKey,
  type Garden,
  type Plant,
} from '@/api/garden';
import { applySeo } from '@/composables/useSeo';
import GardenShell from '@/components/garden/GardenShell.vue';
import SunflowerArt from '@/components/garden/SunflowerArt.vue';
import PlantCardDialog from '@/components/garden/PlantCardDialog.vue';
import SecretShelf from '@/components/garden/SecretShelf.vue';
import {
  RARITY_LABEL,
  builtinStage,
  clockOffset,
  stageFor,
  thaiDate,
} from '@/components/garden/garden';

const route = useRoute();
const router = useRouter();
const slug = String(route.params.slug);

const fromLink = /(?:^#|&)key=([0-9a-f]{64})/.exec(route.hash)?.[1];
if (fromLink) {
  setGardenerKey(slug, fromLink);
  void router.replace({ hash: '' });
}

const garden = ref<Garden | null>(null);
const plants = ref<Plant[] | null>(null);
const error = ref<string | null>(null);
const key = ref(gardenerKey(slug));
const now = ref(Date.now());

async function load(): Promise<void> {
  try {
    const g = await fetchGarden(slug);
    garden.value = g;
    now.value = Date.now() + clockOffset(g);
    applySeo({ title: `สวนของฉัน · ${g.title}` });
    plants.value = key.value ? await fetchMine(slug) : [];
  } catch (err) {
    error.value = errorMessage(err, 'เปิดสวนไม่ได้');
  }
}
void load();

function art(plant: Plant) {
  const g = garden.value!;
  return {
    stageImage: stageFor(g.growthStages, g.revealAt, plant.plantedAt, now.value)?.imageUrl ?? null,
    builtin: builtinStage(g.revealAt, plant.plantedAt, now.value),
  };
}

const canBuy = (plant: Plant) =>
  !!garden.value?.shelf.enabled && !plant.hasSecret && !garden.value.revealed;

// ── Dialogs ──

const cardId = ref<number | null>(null);
const shelfFor = ref<Plant | null>(null);
const notice = ref<string | null>(null);

function bought(plant: Plant, message: string): void {
  shelfFor.value = null;
  notice.value = message;
  if (plants.value) {
    const at = plants.value.findIndex((p) => p.id === plant.id);
    if (at >= 0) plants.value.splice(at, 1, plant);
  }
}

const recovery = computed(() => (key.value ? recoveryLink(slug, key.value) : ''));
const showRecovery = ref(false);
const copied = ref(false);
async function copyRecovery(): Promise<void> {
  try {
    await navigator.clipboard.writeText(recovery.value);
    copied.value = true;
  } catch {
    copied.value = false;
  }
}
</script>

<template>
  <GardenShell :slug="slug" :title="garden?.title" :theme-color="garden?.themeColor">
    <p v-if="error" class="panel center">{{ error }}</p>
    <div v-else-if="!garden || !plants" class="panel center muted">กำลังเปิดสวน…</div>

    <template v-else>
      <header class="head">
        <h1 class="title">สวนของฉัน</h1>
        <p class="muted">
          {{ plants.length }} ต้น ·
          {{ garden.revealed ? 'บานแล้ว 🌻' : `บานพร้อมกัน ${thaiDate(garden.revealAt)}` }}
        </p>
      </header>

      <p v-if="notice" class="notice" role="status">{{ notice }}</p>

      <div v-if="!plants.length" class="panel center">
        <p>เบราว์เซอร์นี้ยังไม่ได้ปลูกทานตะวันในสวนนี้</p>
        <p class="muted small mt">
          ถ้าเคยปลูกจากเครื่องอื่น ให้เปิด "ลิงก์สวนของฉัน" ที่ได้ตอนปลูกต้นแรก
        </p>
        <RouterLink v-if="garden.isOpen" :to="`/garden/plant/${slug}`" class="btn btn-main mt"
          >ปลูกต้นแรก 🌱</RouterLink
        >
      </div>

      <div v-else class="grid">
        <article v-for="plant in plants" :key="plant.id" class="plant">
          <button
            type="button"
            class="plant-art"
            :aria-label="`เปิดการ์ดต้นที่ ${plant.plotIndex}`"
            @click="cardId = plant.id"
          >
            <SunflowerArt
              :flower="plant.flower"
              :face="plant.face"
              :stage-image="art(plant).stageImage"
              :builtin="art(plant).builtin"
              :alt="plant.name"
            />
          </button>
          <div class="plant-body">
            <div class="plant-head">
              <span class="plot">ต้นที่ {{ plant.plotIndex }}</span>
              <span v-if="plant.hasSecret" class="secret">✨ ใส่ปุ๋ยลับแล้ว</span>
            </div>
            <b class="plant-name">{{ plant.name }}</b>
            <p class="plant-msg">{{ plant.message }}</p>
            <p v-if="plant.flower" class="muted small">
              {{ plant.flower.name }} ·
              {{ RARITY_LABEL[plant.flower.rarity] ?? plant.flower.rarity }}
              <template v-if="!garden.revealed"> · รูปหน้าเฉลยในวันเปิดผล</template>
            </p>
            <div class="plant-actions">
              <button type="button" class="btn" @click="cardId = plant.id">การ์ด</button>
              <RouterLink :to="`/garden/${slug}?plant=${plant.id}`" class="btn"
                >ไปที่ต้นนี้ในแปลง</RouterLink
              >
              <button
                v-if="canBuy(plant)"
                type="button"
                class="btn btn-main"
                @click="shelfFor = plant"
              >
                ใส่ปุ๋ยลับ
              </button>
            </div>
          </div>
        </article>
      </div>

      <div v-if="key" class="panel mt">
        <button type="button" class="link-btn" @click="showRecovery = !showRecovery">
          {{ showRecovery ? 'ซ่อน' : 'แสดง' }}ลิงก์สวนของฉัน (ใช้เปิดในเครื่องอื่น)
        </button>
        <div v-if="showRecovery" class="recovery">
          <p class="muted small">
            อย่าส่งให้คนอื่น ใครมีลิงก์นี้เปิดสวนและใส่ปุ๋ยลับให้ต้นของคุณได้
          </p>
          <div class="row">
            <input
              class="input"
              :value="recovery"
              readonly
              @focus="($event.target as HTMLInputElement).select()"
            />
            <button type="button" class="btn" @click="copyRecovery">
              {{ copied ? 'คัดลอกแล้ว' : 'คัดลอก' }}
            </button>
          </div>
        </div>
      </div>
    </template>

    <PlantCardDialog
      v-if="garden && cardId"
      :garden="garden"
      :plant-id="cardId"
      :plant="plants?.find((p) => p.id === cardId) ?? null"
      @close="cardId = null"
    />
    <SecretShelf
      v-if="garden && shelfFor"
      :slug="slug"
      :plant="shelfFor"
      :donation-slug="garden.shelf.donationSlug"
      :donation-name="garden.shelf.donationName"
      @close="shelfFor = null"
      @bought="bought"
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
.small {
  font-size: 0.82rem;
}
.mt {
  margin-top: 14px;
}
.row {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}
.head {
  margin-bottom: 12px;
}
.title {
  font-size: 1.6rem;
  font-weight: 800;
  color: #92400e;
}
.notice {
  margin-bottom: 12px;
  padding: 10px 14px;
  border-radius: 12px;
  background: #dcfce7;
  color: #166534;
  font-weight: 700;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
}
.plant {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-radius: 18px;
  background: rgb(255 255 255 / 0.92);
}
.plant-art {
  width: 96px;
  flex: none;
  padding: 0;
  background: none;
  border: 0;
}
.plant-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.plant-head {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.plot {
  padding: 2px 8px;
  border-radius: 999px;
  background: #fef3c7;
  color: #92400e;
  font-size: 0.75rem;
  font-weight: 800;
}
.secret {
  padding: 2px 8px;
  border-radius: 999px;
  background: #ede9fe;
  color: #5b21b6;
  font-size: 0.75rem;
  font-weight: 800;
}
.plant-name {
  font-size: 1.05rem;
}
.plant-msg {
  font-size: 0.9rem;
  color: #374151;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.plant-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.btn {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 10px;
  border: 1px solid #e5d3b3;
  background: #fff;
  font-weight: 700;
  font-size: 0.85rem;
  color: #78350f;
}
.btn-main {
  background: #f59e0b;
  border-color: #d97706;
  color: #fff;
}
.input {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #e5d3b3;
}
.link-btn {
  font-weight: 700;
  color: #b45309;
  text-decoration: underline;
}
.recovery {
  margin-top: 8px;
}
</style>
