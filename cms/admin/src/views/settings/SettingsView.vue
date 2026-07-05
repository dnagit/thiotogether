<script setup lang="ts">
/**
 * Settings & Theme editor. Reads the flat key/value store, groups it into
 * tabs, writes back only changed keys with their group.
 */
import { reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { http } from '@/api/http';
import MediaPicker from '@/components/MediaPicker.vue';
import { PERMISSIONS, type ApiResponse } from '@cms/shared';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const canManage = auth.can(PERMISSIONS.SETTINGS_MANAGE);

interface SettingDef {
  key: string;
  label: string;
  group: string;
  type: 'text' | 'textarea' | 'image' | 'color' | 'select';
  options?: string[];
}

const defs: SettingDef[] = [
  { key: 'siteName', label: 'Site Name', group: 'general', type: 'text' },
  { key: 'siteDescription', label: 'Site Description', group: 'general', type: 'textarea' },
  { key: 'analyticsId', label: 'Analytics ID (GA4)', group: 'general', type: 'text' },
  { key: 'contactEmail', label: 'Email', group: 'contact', type: 'text' },
  { key: 'contactPhone', label: 'Phone', group: 'contact', type: 'text' },
  { key: 'contactAddress', label: 'Address', group: 'contact', type: 'textarea' },
  { key: 'facebook', label: 'Facebook URL', group: 'social', type: 'text' },
  { key: 'twitter', label: 'Twitter / X URL', group: 'social', type: 'text' },
  { key: 'instagram', label: 'Instagram URL', group: 'social', type: 'text' },
  { key: 'youtube', label: 'YouTube URL', group: 'social', type: 'text' },
  { key: 'line', label: 'LINE URL', group: 'social', type: 'text' },
  { key: 'metaTitle', label: 'Default Meta Title', group: 'seo', type: 'text' },
  { key: 'metaDescription', label: 'Default Meta Description', group: 'seo', type: 'textarea' },
  { key: 'ogImage', label: 'Default OG Image', group: 'seo', type: 'image' },
  { key: 'primaryColor', label: 'Primary Color', group: 'theme', type: 'color' },
  { key: 'secondaryColor', label: 'Secondary Color', group: 'theme', type: 'color' },
  { key: 'logoUrl', label: 'Logo', group: 'theme', type: 'image' },
  { key: 'faviconUrl', label: 'Favicon', group: 'theme', type: 'image' },
  { key: 'fontFamily', label: 'Font Family (CSS)', group: 'theme', type: 'text' },
  { key: 'headerStyle', label: 'Header Style', group: 'theme', type: 'select', options: ['default', 'transparent', 'compact'] },
  { key: 'footerText', label: 'Footer Text', group: 'theme', type: 'textarea' },
];

const tabs = [
  { name: 'general', label: 'General' },
  { name: 'contact', label: 'Contact' },
  { name: 'social', label: 'Social Media' },
  { name: 'seo', label: 'SEO Defaults' },
  { name: 'theme', label: 'Theme' },
];

const values = reactive<Record<string, any>>({});
const loading = ref(true);
const saving = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const { data } = await http.get<ApiResponse<Record<string, unknown>>>('/settings');
    for (const def of defs) values[def.key] = data.data[def.key] ?? '';
  } finally {
    loading.value = false;
  }
}
void load();

async function save(): Promise<void> {
  saving.value = true;
  try {
    await http.put('/settings', {
      settings: defs.map((d) => ({ key: d.key, value: values[d.key] ?? '', group: d.group })),
    });
    ElMessage.success('Settings saved — website theme updates automatically');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div v-loading="loading" class="page-container">
    <div class="page-header">
      <h1>Settings</h1>
      <ElButton v-if="canManage" type="primary" :loading="saving" @click="save">Save All</ElButton>
    </div>

    <ElCard>
      <ElTabs>
        <ElTabPane v-for="tab in tabs" :key="tab.name" :label="tab.label">
          <ElForm label-position="top" :disabled="!canManage" style="max-width: 560px">
            <template v-for="def in defs.filter((d) => d.group === tab.name)" :key="def.key">
              <ElFormItem :label="def.label">
                <MediaPicker v-if="def.type === 'image'" v-model="values[def.key]" />
                <ElColorPicker v-else-if="def.type === 'color'" v-model="values[def.key]" />
                <ElSelect v-else-if="def.type === 'select'" v-model="values[def.key]" style="width: 100%">
                  <ElOption v-for="o in def.options" :key="o" :value="o" :label="o" />
                </ElSelect>
                <ElInput v-else-if="def.type === 'textarea'" v-model="values[def.key]" type="textarea" :rows="2" />
                <ElInput v-else v-model="values[def.key]" />
              </ElFormItem>
            </template>
          </ElForm>
        </ElTabPane>
      </ElTabs>
    </ElCard>
  </div>
</template>
