<script setup lang="ts">
/**
 * Sow a seed: a name, a wish, and a fertiliser mix — two bags off the bench and how the 100%
 * splits between them. What the mix grows is the surprise, so nothing on this page hints at
 * the flower; the seed card that comes back says only what went in.
 *
 * The split is one slider, the first bag's share; the second bag takes the rest, so the two
 * can never fail to add up to 100.
 */
import { computed, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import {
  errorMessage,
  fetchGarden,
  gardenerKey,
  recoveryLink,
  sow,
  type Garden,
  type Plant,
} from '@/api/garden';
import { applySeo } from '@/composables/useSeo';
import GardenShell from '@/components/garden/GardenShell.vue';
import GardenCard from '@/components/garden/GardenCard.vue';
import SunflowerArt from '@/components/garden/SunflowerArt.vue';
import WishCardActions from '@/components/birthday/WishCardActions.vue';
import { thaiDate } from '@/components/garden/garden';

const route = useRoute();
const slug = String(route.params.slug);

const garden = ref<Garden | null>(null);
const loadError = ref<string | null>(null);
void fetchGarden(slug)
  .then((g) => {
    garden.value = g;
    applySeo({
      title: `ปลูกทานตะวัน · ${g.title}`,
      metaDescription: g.description ?? undefined,
      ogImage: g.coverImage ?? undefined,
    });
  })
  .catch((err) => (loadError.value = errorMessage(err, 'ไม่พบสวนนี้')));

const NAME_MAX = 60;
const MESSAGE_MAX = 300;

const form = reactive({ name: '', message: '' });
const picked = ref<number[]>([]);
const share = ref(50);

function toggle(id: number): void {
  const at = picked.value.indexOf(id);
  if (at >= 0) picked.value.splice(at, 1);
  else if (picked.value.length < 2) picked.value.push(id);
}

const bag = (id: number) => garden.value?.fertilizers.find((f) => f.id === id) ?? null;
const first = computed(() => (picked.value[0] ? bag(picked.value[0]) : null));
const second = computed(() => (picked.value[1] ? bag(picked.value[1]) : null));

function setShare(value: number): void {
  share.value = Math.min(99, Math.max(1, Math.round(Number(value) || 1)));
}

const canSow = computed(
  () =>
    !!form.name.trim() &&
    !!form.message.trim() &&
    picked.value.length === 2 &&
    !!garden.value?.isOpen,
);

const sowing = ref(false);
const error = ref<string | null>(null);
const planted = ref<Plant | null>(null);
const notice = ref('');
/** Whether this browser was given its garden key just now, by its first seed. */
const firstSeed = ref(false);
const card = ref<InstanceType<typeof GardenCard> | null>(null);

async function submit(): Promise<void> {
  if (!canSow.value || sowing.value) return;
  sowing.value = true;
  error.value = null;
  const hadKey = !!gardenerKey(slug);
  try {
    const result = await sow(slug, {
      name: form.name.trim(),
      message: form.message.trim(),
      fertilizers: [
        { fertilizerId: picked.value[0], pct: share.value },
        { fertilizerId: picked.value[1], pct: 100 - share.value },
      ],
    });
    planted.value = result.plant;
    notice.value = result.message;
    firstSeed.value = !hadKey;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    sowing.value = false;
  }
}

/** Another seed: a fresh name and wish, the same mix — sowing for several people goes fast. */
function again(): void {
  planted.value = null;
  form.name = '';
  form.message = '';
}

const key = computed(() => (planted.value ? gardenerKey(slug) : null));
const recovery = computed(() => (key.value ? recoveryLink(slug, key.value) : ''));
const cardLink = computed(() =>
  planted.value ? `${window.location.origin}/garden/${slug}?plant=${planted.value.id}` : '',
);

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
    <p v-if="loadError" class="panel center">{{ loadError }}</p>
    <div v-else-if="!garden" class="panel center muted">กำลังโหลด…</div>

    <!-- After sowing: the seed card. -->
    <section v-else-if="planted" class="done">
      <p class="done-note">{{ notice }} 🌱</p>
      <div class="done-card">
        <GardenCard
          ref="card"
          :plant="planted"
          :garden-title="garden.title"
          :reveal-at="garden.revealAt"
          :revealed="false"
          :stage-image="garden.growthStages[0]?.imageUrl ?? null"
          :builtin="0"
          :theme-color="garden.themeColor"
        />
        <WishCardActions
          class="mt"
          :svg="() => card?.svg() ?? null"
          :name="planted.name"
          :title="`บัตรเมล็ดพันธุ์ของ ${planted.name}`"
          save-label="💾 บันทึกบัตร"
          copy-label="🔗 คัดลอกลิงก์"
          :link="cardLink"
          :theme-color="garden.themeColor"
          center
        />
      </div>

      <div v-if="firstSeed && recovery" class="panel recovery">
        <b>เก็บลิงก์สวนของคุณไว้</b>
        <p class="muted small">
          สวนของคุณผูกกับเบราว์เซอร์นี้ ถ้าเปลี่ยนเครื่องหรือล้างข้อมูลเบราว์เซอร์
          ใช้ลิงก์นี้เปิดสวนเดิมได้ อย่าส่งให้คนอื่น เพราะเปิดแล้วใส่ปุ๋ยลับให้ต้นของคุณได้
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

      <div class="done-actions">
        <RouterLink :to="`/garden/${slug}?plant=${planted.id}`" class="btn btn-main"
          >ดูต้นของฉันในแปลง</RouterLink
        >
        <RouterLink :to="`/garden/mine/${slug}`" class="btn">สวนของฉัน</RouterLink>
        <button type="button" class="btn" @click="again">ปลูกอีกต้น</button>
      </div>
    </section>

    <!-- The form. -->
    <section v-else class="sow">
      <header class="intro">
        <h1 class="title">{{ garden.title }}</h1>
        <p v-if="garden.description" class="muted">{{ garden.description }}</p>
        <p class="when">ทุกต้นบานพร้อมกัน {{ thaiDate(garden.revealAt) }}</p>
      </header>

      <div v-if="!garden.isOpen" class="panel center">
        <p v-if="garden.revealed">ทานตะวันบานแล้ว ปิดรับการปลูกแล้ว</p>
        <p v-else>ตอนนี้ยังไม่เปิดรับการปลูก</p>
        <RouterLink :to="`/garden/${slug}`" class="btn btn-main mt">ไปดูแปลงรวม</RouterLink>
      </div>

      <form v-else class="panel" @submit.prevent="submit">
        <label class="field-label" for="g-name">ชื่อของคุณ</label>
        <input
          id="g-name"
          v-model="form.name"
          class="input"
          :maxlength="NAME_MAX"
          placeholder="ชื่อเล่นก็ได้"
        />

        <label class="field-label" for="g-msg">คำอธิษฐาน</label>
        <textarea
          id="g-msg"
          v-model="form.message"
          class="input"
          rows="4"
          :maxlength="MESSAGE_MAX"
          placeholder="อวยพรวันเกิดไทโอ…"
        />
        <div class="counter muted small">{{ form.message.length }}/{{ MESSAGE_MAX }}</div>

        <div class="field-label">
          เลือกปุ๋ย 2 ถุง <span class="muted small">({{ picked.length }}/2)</span>
        </div>
        <div class="bench">
          <button
            v-for="f in garden.fertilizers"
            :key="f.id"
            type="button"
            class="sack"
            :class="{ 'sack-on': picked.includes(f.id) }"
            :disabled="!picked.includes(f.id) && picked.length >= 2"
            :aria-pressed="picked.includes(f.id)"
            @click="toggle(f.id)"
          >
            <img v-if="f.imageUrl" :src="f.imageUrl" :alt="f.name" class="sack-img" />
            <svg v-else viewBox="0 0 60 70" class="sack-img" aria-hidden="true">
              <path d="M14 14 Q30 4 46 14 L52 60 Q30 70 8 60 Z" :fill="f.color" />
              <path d="M14 14 Q30 22 46 14" stroke="#00000033" stroke-width="3" fill="none" />
              <circle cx="30" cy="40" r="9" fill="#ffffffaa" />
            </svg>
            <span class="sack-name">{{ f.name }}</span>
            <span v-if="f.description" class="sack-desc">{{ f.description }}</span>
            <span v-if="picked.includes(f.id)" class="sack-badge">{{
              picked.indexOf(f.id) + 1
            }}</span>
          </button>
        </div>

        <div v-if="first && second" class="mix">
          <div class="field-label">แบ่งสัดส่วนปุ๋ยให้รวมกันได้ 100%</div>
          <div class="mix-bar" aria-hidden="true">
            <span :style="{ width: `${share}%`, background: first.color }" />
            <span :style="{ width: `${100 - share}%`, background: second.color }" />
          </div>
          <input
            type="range"
            min="1"
            max="99"
            class="mix-range"
            :value="share"
            :aria-label="`สัดส่วน ${first.name}`"
            @input="setShare(+($event.target as HTMLInputElement).value)"
          />
          <div class="mix-numbers">
            <label>
              {{ first.name }}
              <input
                type="number"
                min="1"
                max="99"
                class="input num"
                :value="share"
                @change="setShare(+($event.target as HTMLInputElement).value)"
              />%
            </label>
            <label>
              {{ second.name }}
              <input
                type="number"
                min="1"
                max="99"
                class="input num"
                :value="100 - share"
                @change="setShare(100 - +($event.target as HTMLInputElement).value)"
              />%
            </label>
          </div>
        </div>

        <div class="preview">
          <div class="preview-art"><SunflowerArt :builtin="0" alt="เมล็ดทานตะวัน" /></div>
          <p class="muted small">
            หน้าตาดอกจะเป็นอย่างไร ขึ้นกับสูตรปุ๋ยของคุณ เฉลยพร้อมกันวันที่
            {{ thaiDate(garden.revealAt) }}
          </p>
        </div>

        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <button type="submit" class="btn btn-main btn-wide" :disabled="!canSow || sowing">
          {{ sowing ? 'กำลังหย่อนเมล็ด…' : 'หย่อนเมล็ด 🌱' }}
        </button>
        <p v-if="!canSow" class="muted small center">กรอกชื่อ คำอธิษฐาน และเลือกปุ๋ยให้ครบ 2 ถุง</p>
      </form>
    </section>
  </GardenShell>
</template>

<style scoped>
.panel {
  background: rgb(255 255 255 / 0.92);
  border-radius: 18px;
  padding: 18px;
  box-shadow: 0 6px 20px rgb(120 53 15 / 0.08);
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
  margin-top: 12px;
}
.row {
  display: flex;
  gap: 8px;
}
.sow {
  max-width: 640px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.intro {
  text-align: center;
}
.title {
  font-size: 1.6rem;
  font-weight: 800;
  color: #92400e;
}
.when {
  margin-top: 6px;
  font-weight: 700;
  color: #b45309;
}
.field-label {
  display: block;
  margin: 14px 0 6px;
  font-weight: 700;
}
.input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #e5d3b3;
  background: #fff;
  font-size: 1rem;
}
.counter {
  text-align: right;
  margin-top: 2px;
}
.bench {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.sack {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 6px;
  border-radius: 14px;
  border: 2px solid #f3e3c3;
  background: #fffbeb;
  transition:
    transform 0.12s,
    border-color 0.12s;
}
.sack:hover:not(:disabled) {
  transform: translateY(-2px);
}
.sack:disabled {
  opacity: 0.45;
}
.sack-on {
  border-color: #f59e0b;
  background: #fef3c7;
}
.sack-img {
  width: 56px;
  height: 64px;
  object-fit: contain;
}
.sack-name {
  font-weight: 700;
  font-size: 0.9rem;
  text-align: center;
}
.sack-desc {
  font-size: 0.72rem;
  color: #6b7280;
  text-align: center;
}
.sack-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #f59e0b;
  color: #fff;
  font-size: 0.8rem;
  font-weight: 800;
  line-height: 22px;
}
.mix {
  margin-top: 6px;
}
.mix-bar {
  display: flex;
  height: 18px;
  border-radius: 999px;
  overflow: hidden;
  border: 1px solid #e5d3b3;
}
.mix-range {
  width: 100%;
  margin-top: 8px;
  accent-color: #f59e0b;
}
.mix-numbers {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  font-weight: 600;
}
.num {
  width: 72px;
  display: inline-block;
  margin: 0 4px;
  padding: 6px 8px;
  text-align: center;
}
.preview {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}
.preview-art {
  width: 72px;
  flex: none;
}
.error {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fee2e2;
  color: #991b1b;
}
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 16px;
  border-radius: 12px;
  border: 1px solid #e5d3b3;
  background: #fff;
  font-weight: 700;
  color: #78350f;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-main {
  background: #f59e0b;
  border-color: #d97706;
  color: #fff;
}
.btn-wide {
  width: 100%;
  margin-top: 16px;
  padding: 14px;
  font-size: 1.05rem;
}
.done {
  max-width: 520px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.done-note {
  text-align: center;
  font-weight: 800;
  color: #166534;
}
.done-card {
  background: #fff;
  border-radius: 20px;
  padding: 12px;
}
.done-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
.recovery {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
@media (max-width: 420px) {
  .bench {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
