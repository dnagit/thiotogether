<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useDark, useToggle } from '@vueuse/core';
import { ElMessage } from 'element-plus';
import * as Icons from '@element-plus/icons-vue';
import { adminModules } from '@/modules/registry';
import { useAuthStore } from '@/stores/auth';
import { http } from '@/api/http';
import type { ApiResponse } from '@cms/shared';

const router = useRouter();
const auth = useAuthStore();
const isDark = useDark();
const toggleDark = useToggle(isDark);
const collapsed = ref(false);

const menuItems = computed(() =>
  adminModules
    .filter((m) => m.menu && (!m.menu.permission || auth.can(m.menu.permission)))
    .sort((a, b) => a.menu!.order - b.menu!.order)
    .map((m) => ({
      name: m.name,
      label: m.menu!.label,
      icon: (Icons as Record<string, unknown>)[m.menu!.icon],
      route: m.routes[0].name as string,
    })),
);

// ── Global search: pages + donations + projects by keyword ──
const searchQuery = ref('');
interface SearchHit {
  value: string;
  label: string;
  route: { name: string; query?: Record<string, string> };
}
async function searchEverything(q: string, cb: (results: SearchHit[]) => void): Promise<void> {
  if (!q || q.length < 2) return cb([]);
  const hits: SearchHit[] = [];
  try {
    const [pages, donations] = await Promise.all([
      http.get<ApiResponse<any[]>>('/pages', { params: { search: q, limit: 5 } }),
      auth.can('donations.view' as never)
        ? http.get<ApiResponse<any[]>>('/donations', { params: { search: q, limit: 5 } })
        : Promise.resolve({ data: { data: [] } }),
    ]);
    for (const p of pages.data.data)
      hits.push({ value: `📄 ${p.title}`, label: p.path, route: { name: 'page-edit' } as any });
    for (const d of (donations as any).data.data)
      hits.push({
        value: `💰 ${d.donationCode} — ${d.accountName}`,
        label: String(d.amount),
        route: { name: 'donations', query: { search: d.donationCode } },
      });
  } catch {
    /* search is best-effort */
  }
  cb(hits);
}
function onSearchSelect(hit: SearchHit): void {
  searchQuery.value = '';
  void router.push(hit.route);
}

// ── Notifications: pending donations needing attention ──────
const pendingCount = ref(0);
async function loadNotifications(): Promise<void> {
  try {
    const { data } = await http.get<ApiResponse<any>>('/dashboard');
    pendingCount.value = data.data.pendingDonations ?? 0;
  } catch {
    /* dashboard permission may be missing */
  }
}
void loadNotifications();

async function logout(): Promise<void> {
  await auth.logout();
  ElMessage.success('Logged out');
}
</script>

<template>
  <ElContainer class="admin-shell">
    <ElAside :width="collapsed ? '64px' : 'var(--app-sidebar-width)'" class="sidebar">
      <div class="logo" @click="router.push({ name: 'dashboard' })">
        <span v-if="!collapsed">⚡ CMS Admin</span>
        <span v-else>⚡</span>
      </div>
      <ElScrollbar>
        <ElMenu :collapse="collapsed" :default-active="String($route.name)" router-mode class="sidebar-menu">
          <ElMenuItem
            v-for="item in menuItems"
            :key="item.name"
            :index="item.route"
            @click="router.push({ name: item.route })"
          >
            <ElIcon><component :is="item.icon" /></ElIcon>
            <template #title>{{ item.label }}</template>
          </ElMenuItem>
        </ElMenu>
      </ElScrollbar>
    </ElAside>

    <ElContainer>
      <ElHeader class="header" height="var(--app-header-height)">
        <div class="header-left">
          <ElButton text @click="collapsed = !collapsed">
            <ElIcon><component :is="collapsed ? Icons.Expand : Icons.Fold" /></ElIcon>
          </ElButton>
          <ElAutocomplete
            v-model="searchQuery"
            :fetch-suggestions="searchEverything"
            placeholder="Search pages, donations…  (min 2 chars)"
            clearable
            class="global-search"
            @select="onSearchSelect($event as any)"
          />
        </div>
        <div class="header-right">
          <ElBadge :value="pendingCount" :hidden="pendingCount === 0" class="notif">
            <ElButton text circle @click="router.push({ name: 'donations', query: { status: 'NEEDS_REVIEW' } })">
              <ElIcon><Icons.Bell /></ElIcon>
            </ElButton>
          </ElBadge>
          <ElButton text circle @click="toggleDark()">
            <ElIcon><component :is="isDark ? Icons.Sunny : Icons.Moon" /></ElIcon>
          </ElButton>
          <ElDropdown>
            <span class="user-chip">
              <ElAvatar :size="28" :src="auth.user?.avatarUrl ?? undefined">
                {{ auth.user?.name?.charAt(0) }}
              </ElAvatar>
              <span class="user-name">{{ auth.user?.name }}</span>
            </span>
            <template #dropdown>
              <ElDropdownMenu>
                <ElDropdownItem @click="router.push({ name: 'profile' })">My Profile</ElDropdownItem>
                <ElDropdownItem divided @click="logout">Logout</ElDropdownItem>
              </ElDropdownMenu>
            </template>
          </ElDropdown>
        </div>
      </ElHeader>

      <ElMain class="main">
        <RouterView v-slot="{ Component }">
          <Suspense>
            <component :is="Component" />
          </Suspense>
        </RouterView>
      </ElMain>
    </ElContainer>
  </ElContainer>
</template>

<style scoped>
.admin-shell {
  height: 100vh;
}
.sidebar {
  border-right: 1px solid var(--el-border-color-light);
  display: flex;
  flex-direction: column;
  transition: width 0.2s;
}
.logo {
  height: var(--app-header-height);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--el-border-color-light);
}
.sidebar-menu {
  border-right: none;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--el-border-color-light);
  padding: 0 16px;
}
.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.global-search {
  width: 320px;
}
.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.user-name {
  font-size: 13px;
}
.main {
  padding: 0;
  overflow-y: auto;
  background: var(--el-bg-color-page);
}
@media (max-width: 768px) {
  .global-search {
    width: 160px;
  }
  .user-name {
    display: none;
  }
}
</style>
