<script setup lang="ts">
/**
 * The recipe book, laid out by pair: with two bags per mix, every recipe is about one pair of
 * bags and a range of how the 100% is split between them. Six bags make fifteen pairs, which
 * is a grid small enough to see whole — so the grid is the overview, and a pair's recipes open
 * underneath it.
 *
 * Under each pair runs a strip from 1% to 99% of the first bag, coloured by the flower every
 * split would grow with the recipes as they stand on screen. Gaps fall to the default flower,
 * and that is exactly what the strip makes visible before anything is saved.
 *
 * The matching here mirrors `core/garden/gardenRules.ts` on the API. The tester at the bottom
 * asks the API itself, against the recipes as saved.
 */
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { http } from '@/api/http';
import { PERMISSIONS, type ApiResponse } from '@cms/shared';

const props = defineProps<{ event: any }>();

interface Ingredient {
  fertilizerId: number;
  minPct: number;
  maxPct: number;
}
interface Recipe {
  id?: number;
  name: string | null;
  designId: number | null;
  priority: number;
  isActive: boolean;
  ingredients: Ingredient[];
}

const bags = computed(() => props.event.fertilizers.filter((f: any) => f.isActive));
const designs = computed(() => props.event.designs.filter((d: any) => d.isActive));
const designById = (id: number | null) => props.event.designs.find((d: any) => d.id === id) ?? null;
const bagName = (id: number) =>
  props.event.fertilizers.find((f: any) => f.id === id)?.name ?? `#${id}`;

const recipes = ref<Recipe[]>([]);
const loading = ref(true);
const dirty = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const { data } = await http.get<ApiResponse<any[]>>(`/garden/${props.event.id}/recipes`);
    recipes.value = data.data.map((r) => ({
      id: r.id,
      name: r.name,
      designId: r.designId,
      priority: r.priority,
      isActive: r.isActive,
      ingredients: r.ingredients.map((i: any) => ({
        fertilizerId: i.fertilizerId,
        minPct: i.minPct,
        maxPct: i.maxPct,
      })),
    }));
    dirty.value = false;
  } finally {
    loading.value = false;
  }
}
void load();
watch(recipes, () => (dirty.value = true), { deep: true, flush: 'sync' });

// ── Pairs ──

const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const recipePair = (r: Recipe) =>
  r.ingredients.length === 2
    ? pairKey(r.ingredients[0].fertilizerId, r.ingredients[1].fertilizerId)
    : null;

const selected = ref<[number, number] | null>(null);
function selectPair(a: number, b: number): void {
  selected.value = a < b ? [a, b] : [b, a];
}

const pairRecipes = computed(() => {
  if (!selected.value) return [];
  const key = pairKey(...selected.value);
  return recipes.value.filter((r) => recipePair(r) === key);
});
const otherRecipes = computed(() => recipes.value.filter((r) => r.ingredients.length !== 2));
const countFor = (a: number, b: number) =>
  recipes.value.filter((r) => r.isActive && recipePair(r) === pairKey(a, b)).length;

/** A pair recipe edited as one range on the first bag; the second bag's range follows. */
function rangeOf(r: Recipe): [number, number] {
  const first = r.ingredients.find((i) => i.fertilizerId === selected.value?.[0]);
  return first ? [first.minPct, first.maxPct] : [1, 99];
}
function setRange(r: Recipe, [min, max]: [number, number]): void {
  if (!selected.value) return;
  const [a, b] = selected.value;
  r.ingredients = [
    { fertilizerId: a, minPct: min, maxPct: max },
    { fertilizerId: b, minPct: 100 - max, maxPct: 100 - min },
  ];
}

function addRecipe(): void {
  if (!selected.value) return;
  const [a, b] = selected.value;
  recipes.value.push({
    name: null,
    designId: designs.value[0]?.id ?? null,
    priority: 0,
    isActive: true,
    ingredients: [
      { fertilizerId: a, minPct: 1, maxPct: 99 },
      { fertilizerId: b, minPct: 1, maxPct: 99 },
    ],
  });
}
function removeRecipe(r: Recipe): void {
  recipes.value.splice(recipes.value.indexOf(r), 1);
}

// ── Local matching, for the strip ──

function matches(r: Recipe, mix: Array<{ fertilizerId: number; pct: number }>): boolean {
  return (
    r.ingredients.length > 0 &&
    r.ingredients.every((i) => {
      const part = mix.find((p) => p.fertilizerId === i.fertilizerId);
      return !!part && part.pct >= i.minPct && part.pct <= i.maxPct;
    })
  );
}
const width = (r: Recipe) => r.ingredients.reduce((s, i) => s + i.maxPct - i.minPct, 0);
function grows(mix: Array<{ fertilizerId: number; pct: number }>): number | null {
  const hit = recipes.value
    .filter((r) => r.isActive && r.designId && matches(r, mix))
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        b.ingredients.length - a.ingredients.length ||
        width(a) - width(b) ||
        (a.id ?? Infinity) - (b.id ?? Infinity),
    )[0];
  return hit?.designId ?? props.event.defaultDesignId ?? null;
}

const PALETTE = [
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#ec4899',
  '#8b5cf6',
  '#ef4444',
  '#14b8a6',
  '#84cc16',
  '#f97316',
  '#6366f1',
];
const colorOf = (designId: number | null) => {
  if (designId === null) return '#d1d5db';
  if (designId === props.event.defaultDesignId) return '#e5e7eb';
  const index = props.event.designs.findIndex((d: any) => d.id === designId);
  return PALETTE[index % PALETTE.length];
};

/** The strip for the selected pair, as runs of the same flower. */
const strip = computed(() => {
  if (!selected.value) return [];
  const [a, b] = selected.value;
  const runs: Array<{ from: number; to: number; designId: number | null }> = [];
  for (let p = 1; p <= 99; p++) {
    const designId = grows([
      { fertilizerId: a, pct: p },
      { fertilizerId: b, pct: 100 - p },
    ]);
    const last = runs[runs.length - 1];
    if (last && last.designId === designId) last.to = p;
    else runs.push({ from: p, to: p, designId });
  }
  return runs;
});

/** Same pair, same priority, overlapping ranges: which wins is down to the tie-breakers. */
const clashes = computed(() => {
  const out: string[] = [];
  const list = pairRecipes.value.filter((r) => r.isActive);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const [a1, a2] = rangeOf(list[i]);
      const [b1, b2] = rangeOf(list[j]);
      if (list[i].priority === list[j].priority && a1 <= b2 && b1 <= a2) {
        out.push(
          `สูตรที่ ${i + 1} กับ ${j + 1} ช่วงทับกันที่ priority เดียวกัน — ช่วงที่แคบกว่าจะชนะ`,
        );
      }
    }
  }
  return out;
});

// ── Save ──

const saving = ref(false);
async function save(): Promise<void> {
  if (recipes.value.some((r) => !r.designId)) {
    ElMessage.warning('ทุกสูตรต้องเลือกแบบดอก');
    return;
  }
  saving.value = true;
  try {
    await http.put(`/garden/${props.event.id}/recipes`, { recipes: recipes.value });
    ElMessage.success(
      'บันทึกสูตรแล้ว — ต้นที่ปลูกไปแล้วยังใช้แบบเดิม จนกว่าจะกด "คำนวณแบบดอกใหม่ทั้งหมด"',
    );
    await load();
  } finally {
    saving.value = false;
  }
}

// ── Tester ──

const tester = reactive({ a: null as number | null, b: null as number | null, pct: 50 });
const testResult = ref<{ recipeId: number | null; designId: number | null } | null>(null);
const testing = ref(false);
async function runTest(): Promise<void> {
  if (!tester.a || !tester.b || tester.a === tester.b) {
    ElMessage.warning('เลือกปุ๋ย 2 ถุงที่ไม่ซ้ำกัน');
    return;
  }
  testing.value = true;
  try {
    const { data } = await http.post<ApiResponse<any>>(`/garden/${props.event.id}/recipes/test`, {
      fertilizers: [
        { fertilizerId: tester.a, pct: tester.pct },
        { fertilizerId: tester.b, pct: 100 - tester.pct },
      ],
    });
    testResult.value = data.data;
  } finally {
    testing.value = false;
  }
}
</script>

<template>
  <div v-loading="loading">
    <ElAlert
      v-if="bags.length < 2"
      type="warning"
      :closable="false"
      title="เพิ่มปุ๋ยอย่างน้อย 2 ถุงในแท็บ ปุ๋ย ก่อน"
    />
    <template v-else>
      <p class="text-muted intro">
        กดช่องในตารางเพื่อดูและแก้สูตรของปุ๋ยคู่นั้น ตัวเลขในช่องคือจำนวนสูตร ช่องว่าง =
        ได้แบบดอกตั้งต้นทุกสัดส่วน
      </p>

      <div class="matrix-wrap">
        <table class="matrix">
          <thead>
            <tr>
              <th />
              <th v-for="col in bags" :key="col.id">
                <span class="dot" :style="{ background: col.color }" />{{ col.name }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in bags" :key="row.id">
              <th><span class="dot" :style="{ background: row.color }" />{{ row.name }}</th>
              <td v-for="col in bags" :key="col.id">
                <span v-if="row.id === col.id" class="diag">—</span>
                <button
                  v-else
                  type="button"
                  class="pair-cell"
                  :class="{
                    'pair-cell-on':
                      selected && selected.includes(row.id) && selected.includes(col.id),
                    'pair-cell-empty': !countFor(row.id, col.id),
                  }"
                  @click="selectPair(row.id, col.id)"
                >
                  {{ countFor(row.id, col.id) || '·' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <ElCard v-if="selected" shadow="never" class="pair">
        <template #header>
          <b>{{ bagName(selected[0]) }} + {{ bagName(selected[1]) }}</b>
          <span class="text-muted"> — สัดส่วนนับจาก {{ bagName(selected[0]) }}</span>
        </template>

        <div class="strip-label text-muted">
          ทุกสัดส่วนของคู่นี้จะได้ดอกแบบไหน (ตามสูตรบนจอ ยังไม่บันทึกก็เห็น)
        </div>
        <div class="strip">
          <div
            v-for="run in strip"
            :key="run.from"
            class="run"
            :style="{ flexGrow: run.to - run.from + 1, background: colorOf(run.designId) }"
            :title="`${run.from}–${run.to}%: ${designById(run.designId)?.name ?? 'ยังไม่มีแบบดอกตั้งต้น'}`"
          >
            <span v-if="run.to - run.from >= 8" class="run-text">{{
              designById(run.designId)?.name ?? '?'
            }}</span>
          </div>
        </div>
        <div class="strip-scale text-muted"><span>1%</span><span>50%</span><span>99%</span></div>

        <ElAlert
          v-for="c in clashes"
          :key="c"
          class="mt"
          type="info"
          :closable="false"
          :title="c"
        />

        <div v-for="(r, index) in pairRecipes" :key="r.id ?? `new-${index}`" class="recipe">
          <div class="recipe-head">
            <b>สูตรที่ {{ index + 1 }}</b>
            <ElInput
              v-model="r.name"
              size="small"
              placeholder="ชื่อสูตร (ไว้ดูเอง)"
              style="width: 180px"
            />
            <ElSwitch v-model="r.isActive" size="small" active-text="ใช้งาน" />
            <ElButton size="small" type="danger" text @click="removeRecipe(r)">ลบ</ElButton>
          </div>
          <div class="recipe-body">
            <div class="recipe-range">
              <div class="text-muted small">
                {{ bagName(selected[0]) }} {{ rangeOf(r)[0] }}–{{ rangeOf(r)[1] }}% ·
                {{ bagName(selected[1]) }} {{ 100 - rangeOf(r)[1] }}–{{ 100 - rangeOf(r)[0] }}%
              </div>
              <ElSlider
                range
                :min="1"
                :max="99"
                :model-value="rangeOf(r)"
                @update:model-value="setRange(r, $event as [number, number])"
              />
            </div>
            <div class="recipe-design">
              <img
                v-if="designById(r.designId)?.imageUrl"
                :src="designById(r.designId).imageUrl"
                alt=""
              />
              <ElSelect v-model="r.designId" size="small" placeholder="แบบดอก" style="width: 160px">
                <ElOption v-for="d in designs" :key="d.id" :label="d.name" :value="d.id" />
              </ElSelect>
            </div>
            <div>
              <div class="text-muted small">priority</div>
              <ElInputNumber
                v-model="r.priority"
                size="small"
                :min="-1000"
                :max="1000"
                style="width: 100px"
              />
            </div>
          </div>
        </div>

        <ElButton class="mt" @click="addRecipe">+ เพิ่มสูตรให้คู่นี้</ElButton>
      </ElCard>

      <p v-if="otherRecipes.length" class="text-muted mt">
        มีสูตรแบบปุ๋ยถุงเดียวอีก {{ otherRecipes.length }} สูตร (สร้างจากที่อื่น)
        จะถูกเก็บไว้ตามเดิมเมื่อบันทึก
      </p>

      <div class="mt save-row">
        <ElButton
          v-permission="PERMISSIONS.GARDEN_MANAGE"
          type="primary"
          :loading="saving"
          @click="save"
        >
          บันทึกสูตรทั้งหมด
        </ElButton>
        <span v-if="dirty" class="warn">มีการแก้ไขที่ยังไม่บันทึก</span>
      </div>

      <ElDivider content-position="left">ทดสอบสูตร (ใช้สูตรที่บันทึกแล้ว)</ElDivider>
      <div class="tester">
        <ElSelect v-model="tester.a" placeholder="ปุ๋ยถุงแรก" style="width: 160px">
          <ElOption v-for="f in bags" :key="f.id" :label="f.name" :value="f.id" />
        </ElSelect>
        <ElSelect v-model="tester.b" placeholder="ปุ๋ยถุงที่สอง" style="width: 160px">
          <ElOption
            v-for="f in bags"
            :key="f.id"
            :label="f.name"
            :value="f.id"
            :disabled="f.id === tester.a"
          />
        </ElSelect>
        <div class="tester-slider">
          <div class="text-muted small">{{ tester.pct }}% / {{ 100 - tester.pct }}%</div>
          <ElSlider v-model="tester.pct" :min="1" :max="99" />
        </div>
        <ElButton :loading="testing" @click="runTest">ทดสอบ</ElButton>
      </div>
      <div v-if="testResult" class="test-result">
        <img
          v-if="designById(testResult.designId)?.imageUrl"
          :src="designById(testResult.designId).imageUrl"
          alt=""
        />
        <div>
          <b>{{ designById(testResult.designId)?.name ?? 'ยังไม่มีแบบดอกตั้งต้น' }}</b>
          <div class="text-muted small">
            {{
              testResult.recipeId
                ? `จากสูตร #${testResult.recipeId}`
                : 'ไม่เข้าสูตรไหน — ได้แบบดอกตั้งต้น'
            }}
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.intro {
  margin: 0 0 12px;
}
.mt {
  margin-top: 12px;
}
.small {
  font-size: 12px;
}
.warn {
  color: var(--el-color-warning);
  font-weight: 600;
  font-size: 13px;
}
.matrix-wrap {
  overflow-x: auto;
}
.matrix {
  border-collapse: collapse;
  font-size: 13px;
}
.matrix th {
  padding: 6px 8px;
  font-weight: 600;
  white-space: nowrap;
  text-align: left;
}
.matrix td {
  padding: 4px;
  text-align: center;
}
.dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: middle;
}
.diag {
  color: var(--el-text-color-placeholder);
}
.pair-cell {
  width: 52px;
  height: 36px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  border: 1px solid var(--el-border-color);
  background: var(--el-color-primary-light-9);
}
.pair-cell-empty {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-placeholder);
}
.pair-cell-on {
  outline: 2px solid var(--el-color-primary);
}
.pair {
  margin-top: 16px;
}
.strip-label {
  font-size: 12px;
  margin-bottom: 6px;
}
.strip {
  display: flex;
  height: 28px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--el-border-color);
}
.run {
  flex-basis: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}
.run-text {
  font-size: 11px;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 4px;
}
.strip-scale {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  margin-top: 2px;
}
.recipe {
  border-top: 1px solid var(--el-border-color-lighter);
  padding: 12px 0;
  margin-top: 12px;
}
.recipe-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.recipe-body {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.recipe-range {
  flex: 1 1 280px;
  min-width: 240px;
}
.recipe-design {
  display: flex;
  align-items: center;
  gap: 8px;
}
.recipe-design img {
  width: 40px;
  height: 52px;
  object-fit: contain;
}
.save-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.tester {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.tester-slider {
  width: 220px;
}
.test-result {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}
.test-result img {
  width: 64px;
  height: 84px;
  object-fit: contain;
}
</style>
