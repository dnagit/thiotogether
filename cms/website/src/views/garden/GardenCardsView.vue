<script setup lang="ts">
/**
 * Every wish in the garden, as cards — for reading rather than for looking at the field.
 * Opens with the reveal; before it the page says when, since every card would be a seed.
 */
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { errorMessage, fetchField, fetchGarden, type Garden, type Plant } from '@/api/garden';
import { applySeo } from '@/composables/useSeo';
import GardenShell from '@/components/garden/GardenShell.vue';
import SunflowerArt from '@/components/garden/SunflowerArt.vue';
import PlantCardDialog from '@/components/garden/PlantCardDialog.vue';
import { RARITY_LABEL, thaiDate } from '@/components/garden/garden';

const route = useRoute();
const slug = String(route.params.slug);

const garden = ref<Garden | null>(null);
const plants = ref<Plant[]>([]);
const error = ref<string | null>(null);
const loading = ref(true);
const search = ref('');

void fetchGarden(slug)
  .then(async (g) => {
    garden.value = g;
    applySeo({ title: `คำอธิษฐานทั้งหมด · ${g.title}` });
    if (g.revealed) plants.value = await fetchField(slug, true);
  })
  .catch((err) => (error.value = errorMessage(err, 'ไม่พบสวนนี้')))
  .finally(() => (loading.value = false));

const shown = computed(() => {
  const q = search.value.trim().toLowerCase();
  return q ? plants.value.filter((p) => p.name.toLowerCase().includes(q)) : plants.value;
});

const cardId = ref<number | null>(null);
</script>

<template>
  <GardenShell :slug="slug" :title="garden?.title" :theme-color="garden?.themeColor">
    <p v-if="error" class="panel center">{{ error }}</p>
    <div v-else-if="loading" class="panel center muted">กำลังโหลด…</div>

    <div v-else-if="garden && !garden.revealed" class="panel center">
      <p>คำอธิษฐานและหน้าตาทานตะวันทุกต้นจะเปิดพร้อมกัน {{ thaiDate(garden.revealAt) }}</p>
      <RouterLink :to="`/garden/${slug}`" class="btn mt">ไปดูแปลงรวม</RouterLink>
    </div>

    <template v-else-if="garden">
      <header class="head">
        <h1 class="title">คำอธิษฐานทั้งหมด</h1>
        <input v-model="search" class="input" placeholder="ค้นหาชื่อคนปลูก" />
      </header>

      <div class="grid">
        <button
          v-for="plant in shown"
          :key="plant.id"
          type="button"
          class="card"
          @click="cardId = plant.id"
        >
          <div class="card-art">
            <SunflowerArt :flower="plant.flower" :face="plant.face" :alt="plant.name" lazy />
          </div>
          <div class="card-body">
            <span class="plot">ต้นที่ {{ plant.plotIndex }}</span>
            <b>{{ plant.name }}</b>
            <p class="msg">{{ plant.message }}</p>
            <p v-if="plant.flower" class="muted small">
              {{ plant.flower.name }} ·
              {{ RARITY_LABEL[plant.flower.rarity] ?? plant.flower.rarity }}
            </p>
          </div>
        </button>
      </div>
      <p v-if="!shown.length" class="panel center muted">ไม่พบ</p>
    </template>

    <PlantCardDialog
      v-if="garden && cardId"
      :garden="garden"
      :plant-id="cardId"
      :plant="plants.find((p) => p.id === cardId) ?? null"
      @close="cardId = null"
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
  font-size: 0.8rem;
}
.mt {
  margin-top: 12px;
}
.head {
  display: flex;
  align-items: center;
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
.input {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid #e5d3b3;
  min-width: 0;
}
.btn {
  display: inline-flex;
  padding: 8px 14px;
  border-radius: 10px;
  background: #f59e0b;
  color: #fff;
  font-weight: 700;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}
.card {
  display: flex;
  gap: 10px;
  padding: 12px;
  border-radius: 18px;
  background: rgb(255 255 255 / 0.92);
  text-align: left;
}
.card-art {
  width: 80px;
  flex: none;
}
.card-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.plot {
  align-self: flex-start;
  padding: 2px 8px;
  border-radius: 999px;
  background: #fef3c7;
  color: #92400e;
  font-size: 0.72rem;
  font-weight: 800;
}
.msg {
  font-size: 0.88rem;
  color: #374151;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
