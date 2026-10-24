<script setup lang="ts">
/**
 * One plant's card in a popup, with the buttons to keep it: the seed card before the reveal,
 * the reveal card after. The card is fetched whole here — the field lists plants briefly.
 */
import { computed, ref, watch } from 'vue';
import { errorMessage, fetchPlant, type Garden, type Plant } from '@/api/garden';
import WishCardActions from '../birthday/WishCardActions.vue';
import GardenCard from './GardenCard.vue';
import { builtinStage, clockOffset, stageFor } from './garden';

const props = defineProps<{ garden: Garden; plantId: number; plant?: Plant | null }>();
const emit = defineEmits<{ close: [] }>();

const loaded = ref<Plant | null>(props.plant?.message !== undefined ? props.plant : null);
const error = ref<string | null>(null);
const card = ref<InstanceType<typeof GardenCard> | null>(null);

watch(
  () => props.plantId,
  async (id) => {
    if (loaded.value?.id === id) return;
    loaded.value = null;
    error.value = null;
    try {
      loaded.value = await fetchPlant(props.garden.slug, id);
    } catch (err) {
      error.value = errorMessage(err, 'ไม่พบต้นนี้');
    }
  },
  { immediate: true },
);

const now = Date.now() + clockOffset(props.garden);
const stage = computed(() =>
  loaded.value
    ? stageFor(props.garden.growthStages, props.garden.revealAt, loaded.value.plantedAt, now)
    : null,
);
const builtin = computed(() =>
  loaded.value ? builtinStage(props.garden.revealAt, loaded.value.plantedAt, now) : 0,
);
const link = computed(() =>
  loaded.value
    ? `${window.location.origin}/garden/${props.garden.slug}?plant=${loaded.value.id}`
    : '',
);
</script>

<template>
  <div class="card-backdrop" role="dialog" aria-modal="true" @click.self="emit('close')">
    <div class="card-sheet">
      <button type="button" class="card-close" aria-label="ปิด" @click="emit('close')">✕</button>
      <p v-if="error" class="card-error">{{ error }}</p>
      <div v-else-if="!loaded" class="card-wait">กำลังโหลด…</div>
      <template v-else>
        <GardenCard
          ref="card"
          :plant="loaded"
          :garden-title="garden.title"
          :reveal-at="garden.revealAt"
          :revealed="garden.revealed"
          :stage-image="stage?.imageUrl ?? null"
          :builtin="builtin"
          :theme-color="garden.themeColor"
        />
        <WishCardActions
          class="card-actions"
          :svg="() => card?.svg() ?? null"
          :name="loaded.name"
          :title="`ทานตะวันของ ${loaded.name}`"
          save-label="💾 บันทึกรูป"
          copy-label="🔗 คัดลอกลิงก์"
          :link="link"
          :theme-color="garden.themeColor"
          center
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.card-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background: rgb(17 24 39 / 0.6);
}
.card-sheet {
  position: relative;
  width: min(420px, 100%);
  max-height: calc(100svh - 24px);
  overflow-y: auto;
  padding: 14px;
  border-radius: 20px;
  background: #fff;
}
.card-close {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: rgb(255 255 255 / 0.9);
  border: 1px solid #e5e7eb;
  font-weight: 800;
}
.card-actions {
  margin-top: 12px;
}
.card-wait,
.card-error {
  padding: 40px 0;
  text-align: center;
  color: #6b7280;
}
</style>
