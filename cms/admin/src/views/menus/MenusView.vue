<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { http } from '@/api/http';
import MenuItemTree from './MenuItemTree.vue';
import { PERMISSIONS, type ApiResponse } from '@cms/shared';

const menus = ref<any[]>([]);
const activeMenuId = ref<number | null>(null);
const items = ref<any[]>([]);
const loading = ref(false);
const saving = ref(false);
const pages = ref<any[]>([]);

let keySeq = 0;
const withKeys = (nodes: any[]): any[] =>
  nodes.map((n) => ({ ...n, _key: `mi-${++keySeq}`, children: withKeys(n.children ?? []) }));

async function loadMenus(): Promise<void> {
  const { data } = await http.get<ApiResponse<any[]>>('/menus');
  menus.value = data.data;
  if (!activeMenuId.value && menus.value.length) activeMenuId.value = menus.value[0].id;
}

async function loadItems(): Promise<void> {
  if (!activeMenuId.value) return;
  loading.value = true;
  try {
    const { data } = await http.get<ApiResponse<any>>(`/menus/${activeMenuId.value}`);
    items.value = withKeys(data.data.items ?? []);
  } finally {
    loading.value = false;
  }
}

async function loadPages(): Promise<void> {
  const { data } = await http.get<ApiResponse<any[]>>('/pages', { params: { limit: 100 } });
  pages.value = data.data;
}

void loadMenus().then(loadItems);
void loadPages();
watch(activeMenuId, loadItems);

// ── Menu CRUD ───────────────────────────────────────────────
const menuDialog = ref(false);
const menuForm = reactive({ id: null as number | null, name: '', location: '', isActive: true });

function openMenuDialog(menu?: any): void {
  Object.assign(menuForm, menu ?? { id: null, name: '', location: '', isActive: true });
  menuDialog.value = true;
}

async function saveMenu(): Promise<void> {
  const payload = { name: menuForm.name, location: menuForm.location, isActive: menuForm.isActive };
  if (menuForm.id) await http.put(`/menus/${menuForm.id}`, payload);
  else await http.post('/menus', payload);
  menuDialog.value = false;
  ElMessage.success('Menu saved');
  await loadMenus();
}

async function deleteMenu(menu: any): Promise<void> {
  try {
    await ElMessageBox.confirm(`Delete menu "${menu.name}" and all its items?`, 'Confirm', { type: 'warning' });
  } catch {
    return;
  }
  await http.delete(`/menus/${menu.id}`);
  if (activeMenuId.value === menu.id) activeMenuId.value = null;
  await loadMenus();
  await loadItems();
}

// ── Item editing ────────────────────────────────────────────
const itemDialog = ref(false);
const editingItem = ref<any | null>(null);
const itemForm = reactive({
  label: '', icon: '', type: 'PAGE', pageId: null as number | null,
  url: '', target: '_self', isActive: true,
});

function openItemDialog(item?: any): void {
  editingItem.value = item ?? null;
  Object.assign(itemForm, item ?? {
    label: '', icon: '', type: 'PAGE', pageId: null, url: '', target: '_self', isActive: true,
  });
  itemDialog.value = true;
}

function applyItem(): void {
  const data = { ...itemForm };
  if (editingItem.value) {
    Object.assign(editingItem.value, data);
  } else {
    items.value.push({ ...data, _key: `mi-${++keySeq}`, children: [] });
  }
  itemDialog.value = false;
}

function removeItem(target: any): void {
  const prune = (nodes: any[]): any[] =>
    nodes.filter((n) => n._key !== target._key).map((n) => ({ ...n, children: prune(n.children) }));
  items.value = prune(items.value);
}

// ── Persist tree ────────────────────────────────────────────
function serialize(nodes: any[]): any[] {
  return nodes.map((n, i) => ({
    id: n.id,
    label: n.label,
    icon: n.icon || null,
    type: n.type,
    pageId: n.type === 'PAGE' ? n.pageId : null,
    url: n.type === 'PAGE' ? null : n.url || null,
    target: n.target ?? '_self',
    sortOrder: i,
    isActive: n.isActive ?? true,
    children: serialize(n.children ?? []),
  }));
}

async function saveItems(): Promise<void> {
  if (!activeMenuId.value) return;
  saving.value = true;
  try {
    await http.put(`/menus/${activeMenuId.value}/items`, { items: serialize(items.value) });
    ElMessage.success('Menu saved');
    await loadItems();
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>Menus</h1>
      <ElButton v-permission="PERMISSIONS.MENUS_MANAGE" type="primary" @click="openMenuDialog()">+ New Menu</ElButton>
    </div>

    <ElRow :gutter="16">
      <ElCol :xs="24" :sm="7" :md="6">
        <ElCard header="All Menus">
          <div
            v-for="menu in menus"
            :key="menu.id"
            class="menu-list-item"
            :class="{ active: menu.id === activeMenuId }"
            @click="activeMenuId = menu.id"
          >
            <div>
              <div class="menu-name">{{ menu.name }}</div>
              <code class="text-muted">{{ menu.location }}</code>
            </div>
            <span>
              <ElButton size="small" text @click.stop="openMenuDialog(menu)">✎</ElButton>
              <ElButton size="small" text type="danger" @click.stop="deleteMenu(menu)">✕</ElButton>
            </span>
          </div>
          <ElEmpty v-if="!menus.length" description="No menus" :image-size="60" />
        </ElCard>
      </ElCol>

      <ElCol :xs="24" :sm="17" :md="18">
        <ElCard v-loading="loading">
          <template #header>
            <div class="card-head">
              <span>Menu Items <span class="text-muted">(drag to reorder / nest)</span></span>
              <span>
                <ElButton size="small" @click="openItemDialog()">+ Add Item</ElButton>
                <ElButton size="small" type="primary" :loading="saving" @click="saveItems">Save</ElButton>
              </span>
            </div>
          </template>
          <MenuItemTree :items="items" @edit="openItemDialog" @remove="removeItem" />
          <ElEmpty v-if="!items.length" description="No items yet" :image-size="60" />
        </ElCard>
      </ElCol>
    </ElRow>

    <!-- Menu dialog -->
    <ElDialog v-model="menuDialog" :title="menuForm.id ? 'Edit Menu' : 'New Menu'" width="420px">
      <ElForm label-position="top">
        <ElFormItem label="Name" required><ElInput v-model="menuForm.name" /></ElFormItem>
        <ElFormItem label="Location key" required>
          <ElInput v-model="menuForm.location" placeholder="main / footer / sidebar / mobile" />
        </ElFormItem>
        <ElFormItem><ElCheckbox v-model="menuForm.isActive">Active</ElCheckbox></ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="menuDialog = false">Cancel</ElButton>
        <ElButton type="primary" @click="saveMenu">Save</ElButton>
      </template>
    </ElDialog>

    <!-- Item dialog -->
    <ElDialog v-model="itemDialog" :title="editingItem ? 'Edit Item' : 'Add Item'" width="480px">
      <ElForm label-position="top">
        <ElFormItem label="Label" required><ElInput v-model="itemForm.label" /></ElFormItem>
        <ElFormItem label="Icon (emoji or class)"><ElInput v-model="itemForm.icon" /></ElFormItem>
        <ElFormItem label="Type">
          <ElSelect v-model="itemForm.type" style="width: 100%">
            <ElOption value="PAGE" label="Dynamic Page" />
            <ElOption value="EXTERNAL" label="External URL" />
            <ElOption value="CATEGORY" label="Category" />
            <ElOption value="ANCHOR" label="Anchor" />
            <ElOption value="CUSTOM" label="Custom Route" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem v-if="itemForm.type === 'PAGE'" label="Page">
          <ElSelect v-model="itemForm.pageId" filterable style="width: 100%">
            <ElOption v-for="p in pages" :key="p.id" :value="p.id" :label="`${p.title} (${p.path})`" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem v-else label="URL / Anchor / Route">
          <ElInput v-model="itemForm.url" placeholder="https://… or #section or /donation" />
        </ElFormItem>
        <ElFormItem label="Target">
          <ElRadioGroup v-model="itemForm.target">
            <ElRadio value="_self">Same tab</ElRadio>
            <ElRadio value="_blank">New tab</ElRadio>
          </ElRadioGroup>
        </ElFormItem>
        <ElFormItem><ElCheckbox v-model="itemForm.isActive">Active</ElCheckbox></ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="itemDialog = false">Cancel</ElButton>
        <ElButton type="primary" :disabled="!itemForm.label" @click="applyItem">Apply</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.menu-list-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 10px; border-radius: 6px; cursor: pointer; margin-bottom: 4px;
}
.menu-list-item.active { background: var(--el-color-primary-light-9); }
.menu-name { font-weight: 600; }
.card-head { display: flex; justify-content: space-between; align-items: center; }
</style>
