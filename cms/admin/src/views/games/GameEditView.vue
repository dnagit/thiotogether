<script setup lang="ts">
/**
 * Game editor: settings, the reward list, and a board preview.
 *
 * Rewards and tile count are frozen once anyone has reserved a tile — the server
 * enforces that, and this view mirrors it so the controls explain themselves rather
 * than failing on save.
 */
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { http } from '@/api/http';
import MediaPicker from '@/components/MediaPicker.vue';
import { PERMISSIONS, type ApiResponse } from '@cms/shared';

const route = useRoute();
const router = useRouter();
const gameId = Number(route.params.id);

const game = ref<any>(null);
const rewards = ref<Array<{ label: string; imageUrl: string | null }>>([]);
const projects = ref<any[]>([]);
const tiles = ref<any[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);
const tab = ref('settings');

const locked = computed(() => (game.value?._count?.reservations ?? 0) > 0);
const revealed = computed(() => game.value?.status === 'REVEALED');
const readOnly = computed(() => locked.value || revealed.value);
const rewardDelta = computed(() => rewards.value.length - (game.value?.tileCount ?? 0));

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const [{ data: g }, { data: p }] = await Promise.all([
      http.get<ApiResponse<any>>(`/games/${gameId}`),
      http.get<ApiResponse<any[]>>('/donation-projects', { params: { limit: 100 } }),
    ]);
    game.value = { ...g.data, projectIds: g.data.projects.map((x: any) => x.project.id) };
    rewards.value = g.data.rewards.map((r: any) => ({ label: r.label, imageUrl: r.imageUrl }));
    projects.value = p.data;
  } catch (err: any) {
    error.value = err?.response?.data?.message ?? 'โหลดข้อมูลเกมไม่สำเร็จ';
  } finally {
    loading.value = false;
  }
}
void load();

async function loadBoard(): Promise<void> {
  const { data } = await http.get<ApiResponse<any[]>>(`/games/${gameId}/board`);
  tiles.value = data.data;
  covers.value = data.data.map((t: any) => ({
    boardNumber: t.boardNumber,
    frontImage: t.frontImage ?? null,
  }));
}

// ── Per-tile cover art ──────────────────────────────────────
const covers = ref<Array<{ boardNumber: number; frontImage: string | null }>>([]);

async function saveCovers(): Promise<void> {
  saving.value = true;
  try {
    await http.put(`/games/${gameId}/tiles`, { tiles: covers.value });
    ElMessage.success('บันทึกรูปปกป้ายแล้ว');
    await loadBoard();
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message ?? 'บันทึกรูปปกไม่สำเร็จ');
  } finally {
    saving.value = false;
  }
}

/** Apply one picture to every tile that has no cover of its own yet. */
function fillEmptyCovers(url: string | null): void {
  if (!url) return;
  covers.value = covers.value.map((c) => (c.frontImage ? c : { ...c, frontImage: url }));
}
function clearCovers(): void {
  covers.value = covers.value.map((c) => ({ ...c, frontImage: null }));
}

async function saveSettings(): Promise<void> {
  saving.value = true;
  try {
    const g = game.value;
    await http.put(`/games/${gameId}`, {
      name: g.name, slug: g.slug, description: g.description, coverImage: g.coverImage,
      tileCount: g.tileCount, tileFrontImage: g.tileFrontImage, tokensPerTile: g.tokensPerTile,
      showReserverNames: g.showReserverNames, maxTilesPerAccount: g.maxTilesPerAccount,
      themeColor: g.themeColor, opensAt: g.opensAt, closesAt: g.closesAt,
      projectIds: g.projectIds,
    });
    ElMessage.success('บันทึกแล้ว');
    await load();
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message ?? 'บันทึกไม่สำเร็จ');
  } finally {
    saving.value = false;
  }
}

async function saveRewards(): Promise<void> {
  saving.value = true;
  try {
    await http.put(`/games/${gameId}/rewards`, { rewards: rewards.value });
    ElMessage.success(`บันทึกรางวัล ${rewards.value.length} รายการแล้ว`);
    await load();
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message ?? 'บันทึกรางวัลไม่สำเร็จ');
  } finally {
    saving.value = false;
  }
}

function addReward(): void {
  rewards.value.push({ label: '', imageUrl: null });
}
function removeReward(i: number): void {
  rewards.value.splice(i, 1);
}

/** Fill the list up to tileCount with a repeated consolation line. */
function padToTileCount(): void {
  const need = (game.value?.tileCount ?? 0) - rewards.value.length;
  for (let i = 0; i < need; i++) rewards.value.push({ label: 'ขอบคุณที่ร่วมสนุก', imageUrl: null });
}

// ── Paste / import ──────────────────────────────────────────
const pasteDialog = ref(false);
const pasteText = ref('');
const pasteReplace = ref(true);

async function importPasted(): Promise<void> {
  saving.value = true;
  try {
    const { data } = await http.post<ApiResponse<any>>(`/games/${gameId}/rewards/bulk`, {
      text: pasteText.value,
      replace: pasteReplace.value,
    });
    ElMessage.success(data.message ?? 'นำเข้าแล้ว');
    pasteDialog.value = false;
    pasteText.value = '';
    await load();
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message ?? 'นำเข้าไม่สำเร็จ');
  } finally {
    saving.value = false;
  }
}

function onCsvFile(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    pasteText.value = String(reader.result);
    pasteDialog.value = true;
  };
  reader.readAsText(file, 'utf-8');
}

async function reshuffle(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      'สุ่มจับคู่รางวัลกับป้ายใหม่ทั้งหมด ทำได้เฉพาะก่อนมีผู้จองป้ายแรก',
      'ยืนยันการสุ่มใหม่',
      { type: 'warning', confirmButtonText: 'สุ่มใหม่', cancelButtonText: 'ยกเลิก' },
    );
  } catch {
    return;
  }
  try {
    const { data } = await http.post<ApiResponse<any>>(`/games/${gameId}/shuffle`);
    ElMessage.success(`สุ่มใหม่แล้ว (commitment ${String(data.data.commitmentHash).slice(0, 12)}…)`);
    await load();
    if (tab.value === 'board') await loadBoard();
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message ?? 'สุ่มใหม่ไม่สำเร็จ');
  }
}
</script>

<template>
  <div class="page-container">
    <div v-if="loading" v-loading="true" class="loading-block" />

    <ElResult v-else-if="error" icon="error" :title="error">
      <template #extra><ElButton type="primary" @click="load">ลองใหม่</ElButton></template>
    </ElResult>

    <template v-else-if="game">
      <div class="page-header">
        <div>
          <ElButton link @click="router.push({ name: 'games' })">← กลับ</ElButton>
          <h1>{{ game.name }}</h1>
          <div class="text-muted">/game/{{ game.slug }} · {{ game.tileCount }} ป้าย · จองแล้ว {{ game._count.reservations }}</div>
        </div>
      </div>

      <ElAlert
        v-if="revealed"
        type="info" show-icon :closable="false"
        title="เกมนี้เฉลยผลแล้ว" description="ข้อมูลถูกล็อกถาวรเพื่อรักษาความถูกต้องของผล"
        class="mb"
      />
      <ElAlert
        v-else-if="locked"
        type="warning" show-icon :closable="false"
        title="เกมนี้มีผู้จองแล้ว"
        description="แก้ไขรางวัล จำนวนป้าย หรือสุ่มใหม่ไม่ได้ เพื่อไม่ให้ผลของผู้ที่จองไปแล้วเปลี่ยน"
        class="mb"
      />

      <ElTabs v-model="tab" @tab-change="(tab === 'board' || tab === 'covers') && loadBoard()">
        <!-- ── Settings ── -->
        <ElTabPane label="ตั้งค่าเกม" name="settings">
          <ElCard>
            <ElForm label-position="top" :disabled="revealed">
              <ElRow :gutter="12">
                <ElCol :span="14"><ElFormItem label="ชื่อเกม" required><ElInput v-model="game.name" /></ElFormItem></ElCol>
                <ElCol :span="10"><ElFormItem label="Slug"><ElInput v-model="game.slug" /></ElFormItem></ElCol>
              </ElRow>
              <ElFormItem label="คำอธิบาย"><ElInput v-model="game.description" type="textarea" :rows="3" /></ElFormItem>

              <ElRow :gutter="12">
                <ElCol :span="8">
                  <ElFormItem label="จำนวนป้าย">
                    <ElInputNumber v-model="game.tileCount" :min="1" :max="1000" :disabled="locked" style="width: 100%" />
                    <div v-if="locked" class="text-muted hint">ล็อกแล้วเพราะมีผู้จอง</div>
                  </ElFormItem>
                </ElCol>
                <ElCol :span="8">
                  <ElFormItem label="Token ต่อ 1 ป้าย">
                    <ElInputNumber v-model="game.tokensPerTile" :min="1" :max="100" style="width: 100%" />
                  </ElFormItem>
                </ElCol>
                <ElCol :span="8">
                  <ElFormItem label="จองได้สูงสุด/บัญชี">
                    <ElInputNumber v-model="game.maxTilesPerAccount" :min="1" placeholder="ไม่จำกัด" style="width: 100%" />
                  </ElFormItem>
                </ElCol>
              </ElRow>

              <ElFormItem label="โครงการบริจาคที่ใช้ token กับเกมนี้ได้" required>
                <ElSelect v-model="game.projectIds" multiple style="width: 100%">
                  <ElOption
                    v-for="p in projects" :key="p.id" :value="p.id"
                    :label="p.tokenValue ? `${p.name} — 1 token = ${p.tokenValue} บาท` : `${p.name} (ยังไม่ตั้งค่า token)`"
                  />
                </ElSelect>
              </ElFormItem>

              <ElRow :gutter="12">
                <ElCol :span="12"><ElFormItem label="ภาพ Cover"><MediaPicker v-model="game.coverImage" /></ElFormItem></ElCol>
                <ElCol :span="12">
                  <ElFormItem label="รูปด้านหน้าป้าย (ใช้ร่วมทุกป้าย)"><MediaPicker v-model="game.tileFrontImage" /></ElFormItem>
                </ElCol>
              </ElRow>

              <ElRow :gutter="12">
                <ElCol :span="8"><ElFormItem label="เปิดจอง"><ElDatePicker v-model="game.opensAt" type="datetime" style="width: 100%" /></ElFormItem></ElCol>
                <ElCol :span="8"><ElFormItem label="ปิดรับจอง"><ElDatePicker v-model="game.closesAt" type="datetime" style="width: 100%" /></ElFormItem></ElCol>
                <ElCol :span="8"><ElFormItem label="สีธีม"><ElColorPicker v-model="game.themeColor" /></ElFormItem></ElCol>
              </ElRow>

              <ElFormItem label="แสดงชื่อผู้จองก่อนเฉลย">
                <ElSwitch v-model="game.showReserverNames" active-text="แสดงชื่อ" inactive-text="แสดงเพียง 'มีผู้จองแล้ว'" />
              </ElFormItem>
            </ElForm>

            <template #footer>
              <ElButton v-permission="PERMISSIONS.GAMES_MANAGE" type="primary" :loading="saving" :disabled="revealed" @click="saveSettings">
                บันทึกการตั้งค่า
              </ElButton>
            </template>
          </ElCard>
        </ElTabPane>

        <!-- ── Rewards ── -->
        <ElTabPane name="rewards">
          <template #label>
            ข้อความรางวัล
            <ElBadge :value="rewards.length" :type="rewardDelta === 0 ? 'success' : 'warning'" class="badge" />
          </template>

          <ElCard>
            <ElAlert
              :type="rewardDelta === 0 ? 'success' : 'warning'"
              show-icon :closable="false" class="mb"
              :title="rewardDelta === 0
                ? `ครบแล้ว: รางวัล ${rewards.length} รายการ เท่ากับจำนวนป้าย`
                : rewardDelta < 0
                  ? `ยังขาดอีก ${-rewardDelta} รายการ (มี ${rewards.length} จาก ${game.tileCount})`
                  : `เกินมา ${rewardDelta} รายการ (มี ${rewards.length} จาก ${game.tileCount})`"
              :description="rewardDelta === 0 ? undefined : 'จำนวนรางวัลต้องเท่ากับจำนวนป้ายจึงจะเปิดเกมได้'"
            />

            <div v-if="!readOnly" class="toolbar mb">
              <ElButton @click="addReward">+ เพิ่มทีละรายการ</ElButton>
              <ElButton @click="pasteDialog = true">วางหลายบรรทัด</ElButton>
              <ElButton @click="($refs.csvInput as HTMLInputElement).click()">นำเข้า CSV</ElButton>
              <input ref="csvInput" type="file" accept=".csv,.txt" hidden @change="onCsvFile" />
              <ElButton v-if="rewardDelta < 0" type="primary" plain @click="padToTileCount">
                เติมให้ครบ {{ game.tileCount }} ด้วย "ขอบคุณที่ร่วมสนุก"
              </ElButton>
            </div>

            <ElTable :data="rewards" max-height="480">
              <ElTableColumn label="#" width="60" align="center">
                <template #default="{ $index }">{{ $index + 1 }}</template>
              </ElTableColumn>
              <ElTableColumn label="ข้อความรางวัล">
                <template #default="{ row }">
                  <ElInput v-model="row.label" :disabled="readOnly" maxlength="500" placeholder="เช่น บัตรกำนัล 500 บาท" />
                </template>
              </ElTableColumn>
              <ElTableColumn label="รูปตอนเฉลย (ถ้ามี)" width="200">
                <template #default="{ row }"><MediaPicker v-model="row.imageUrl" :disabled="readOnly" /></template>
              </ElTableColumn>
              <ElTableColumn v-if="!readOnly" label="" width="70" align="center">
                <template #default="{ $index }">
                  <ElButton size="small" type="danger" text @click="removeReward($index)">ลบ</ElButton>
                </template>
              </ElTableColumn>
              <template #empty>
                <div class="empty">ยังไม่มีข้อความรางวัล — เพิ่มทีละรายการ วางหลายบรรทัด หรือนำเข้า CSV</div>
              </template>
            </ElTable>

            <template #footer>
              <ElButton v-permission="PERMISSIONS.GAMES_MANAGE" type="primary" :loading="saving" :disabled="readOnly" @click="saveRewards">
                บันทึกรางวัล
              </ElButton>
              <ElButton v-permission="PERMISSIONS.GAMES_MANAGE" :disabled="readOnly || !game.shuffledAt" @click="reshuffle">
                สุ่มจับคู่ใหม่
              </ElButton>
              <span v-if="game.commitmentHash" class="text-muted hash">
                commitment: {{ String(game.commitmentHash).slice(0, 16) }}…
              </span>
            </template>
          </ElCard>
        </ElTabPane>

        <!-- ── Per-tile cover art ── -->
        <ElTabPane label="รูปปกป้าย" name="covers">
          <ElCard>
            <ElAlert
              type="info" show-icon :closable="false" class="mb"
              title="รูปปกคือรูปที่ผู้เล่นเห็นบนหน้าป้ายก่อนเฉลย"
              description="ผูกกับหมายเลขป้าย ไม่ได้ผูกกับรางวัล — เปลี่ยนได้ตลอดโดยไม่กระทบผลรางวัล ป้ายที่ไม่ตั้งรูปจะใช้รูปกลางจากแท็บตั้งค่าเกม"
            />

            <div class="toolbar mb">
              <span class="text-muted">ใช้รูปเดียวกับทุกป้ายที่ยังว่าง:</span>
              <MediaPicker :model-value="null" @update:model-value="fillEmptyCovers" />
              <ElButton :disabled="revealed" @click="clearCovers">ล้างรูปทั้งหมด</ElButton>
            </div>

            <div v-if="covers.length === 0" class="empty">
              กดแท็บนี้อีกครั้งเพื่อโหลดรายการป้าย
            </div>
            <div v-else class="cover-grid">
              <div v-for="c in covers" :key="c.boardNumber" class="cover-cell">
                <div class="cover-no">ป้าย #{{ c.boardNumber }}</div>
                <MediaPicker v-model="c.frontImage" />
              </div>
            </div>

            <template #footer>
              <ElButton v-permission="PERMISSIONS.GAMES_MANAGE" type="primary" :loading="saving" :disabled="revealed" @click="saveCovers">
                บันทึกรูปปกป้าย
              </ElButton>
            </template>
          </ElCard>
        </ElTabPane>

        <!-- ── Board preview ── -->
        <ElTabPane label="ดูตัวอย่างกระดาน" name="board">
          <ElCard>
            <ElAlert
              type="warning" show-icon :closable="false" class="mb"
              title="หน้านี้แสดงรางวัลของทุกป้าย"
              description="เห็นได้เฉพาะผู้ดูแลระบบ ผู้เล่นจะไม่เห็นข้อมูลนี้จนกว่าจะกดเฉลย"
            />
            <div v-if="tiles.length === 0" class="empty">กดแท็บนี้อีกครั้งเพื่อโหลด หรือยังไม่ได้สุ่มรางวัล</div>
            <div v-else class="board">
              <div v-for="t in tiles" :key="t.id" class="tile" :class="{ taken: t.reservation }">
                <div class="tile-no">#{{ t.boardNumber }}</div>
                <div class="tile-reward">{{ t.reward?.label ?? '— ยังไม่สุ่ม —' }}</div>
                <div v-if="t.reservation" class="tile-by">🔒 {{ t.reservation.accountNameSnapshot }}</div>
                <div v-else class="tile-free">ว่าง</div>
              </div>
            </div>
          </ElCard>
        </ElTabPane>
      </ElTabs>

      <ElDialog v-model="pasteDialog" title="วางข้อความรางวัลหลายบรรทัด" width="600px">
        <p class="text-muted">หนึ่งรางวัลต่อหนึ่งบรรทัด ถ้าเป็น CSV จะใช้คอลัมน์แรก</p>
        <ElInput v-model="pasteText" type="textarea" :rows="12" placeholder="บัตรกำนัล 1,000 บาท&#10;เสื้อยืดที่ระลึก&#10;ขอบคุณที่ร่วมสนุก" />
        <ElCheckbox v-model="pasteReplace" class="mt">แทนที่รายการเดิมทั้งหมด (ไม่ติ๊ก = เพิ่มต่อท้าย)</ElCheckbox>
        <template #footer>
          <ElButton @click="pasteDialog = false">ยกเลิก</ElButton>
          <ElButton type="primary" :loading="saving" :disabled="!pasteText.trim()" @click="importPasted">นำเข้า</ElButton>
        </template>
      </ElDialog>
    </template>
  </div>
</template>

<style scoped>
.mb { margin-bottom: 12px; }
.mt { margin-top: 12px; }
.hint { font-size: 12px; }
.hash { margin-left: 12px; font-size: 12px; font-family: monospace; }
.badge { margin-left: 6px; }
.loading-block { min-height: 320px; }
.empty { padding: 32px; text-align: center; color: var(--el-text-color-secondary); }
.board { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.tile {
  border: 1px solid var(--el-border-color);
  border-radius: 10px; padding: 10px; background: var(--el-fill-color-blank);
}
.tile.taken { border-color: var(--el-color-warning); background: var(--el-color-warning-light-9); }
.tile-no { font-weight: 700; font-size: 13px; }
.tile-reward { font-size: 13px; margin: 4px 0; min-height: 34px; }
.tile-by { font-size: 12px; color: var(--el-color-warning-dark-2); }
.tile-free { font-size: 12px; color: var(--el-text-color-secondary); }
.cover-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.cover-cell { border: 1px solid var(--el-border-color-light); border-radius: 10px; padding: 10px; }
.cover-no { font-weight: 700; font-size: 13px; margin-bottom: 6px; }
</style>
