<script setup lang="ts">
/**
 * Settings & Theme editor. Reads the flat key/value store, groups it into
 * tabs, writes back only changed keys with their group.
 */
import { reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { http } from '@/api/http';
import MediaPicker from '@/components/MediaPicker.vue';
import BlockPropsEditor from '@/components/BlockPropsEditor.vue';
import type { BlockField } from '@/blocks/definitions';
import { PERMISSIONS, type ApiResponse } from '@cms/shared';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const canManage = auth.can(PERMISSIONS.SETTINGS_MANAGE);

interface SettingDef {
  key: string;
  label: string;
  group: string;
  type: 'text' | 'textarea' | 'image' | 'color' | 'select' | 'switch' | 'items';
  options?: string[];
  /** Shown under the field — for settings whose effect is not obvious from the label. */
  hint?: string;
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
  {
    key: 'socialList',
    label: 'Social icons (shown in the footer)',
    group: 'social',
    type: 'items',
    hint: 'Each row is one icon in the footer. Rows with no image are skipped.',
  },
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
  {
    key: 'popupEnabled',
    label: 'Show popup',
    group: 'popup',
    type: 'switch',
    hint: 'Off hides it everywhere at once. A popup with no banner image never shows, whatever this says.',
  },
  { key: 'popupImage', label: 'Banner image', group: 'popup', type: 'image' },
  {
    key: 'popupTitle',
    label: 'Banner description',
    group: 'popup',
    type: 'text',
    hint: 'Read out by screen readers and shown if the image fails to load. Describe what the banner says.',
  },
  {
    key: 'popupLink',
    label: 'Link',
    group: 'popup',
    type: 'text',
    hint: 'Where the banner goes when clicked, e.g. https://example.com or /donate. Leave empty for a banner that is not clickable.',
  },
  {
    key: 'popupLinkNewTab',
    label: 'Open the link in a new tab',
    group: 'popup',
    type: 'switch',
  },
  {
    key: 'popupPages',
    label: 'Show on',
    group: 'popup',
    type: 'select',
    options: ['home', 'all'],
    hint: '"home" shows it on the front page only; "all" on every page of the site.',
  },
  {
    key: 'popupFrequency',
    label: 'Show again',
    group: 'popup',
    type: 'select',
    options: ['session', 'day', 'always'],
    hint: 'How soon a visitor who closed it sees it again: "session" not until they return, "day" after 24 hours, "always" on every page they open.',
  },
];

const tabs = [
  { name: 'general', label: 'General' },
  { name: 'contact', label: 'Contact' },
  { name: 'social', label: 'Social Media' },
  { name: 'seo', label: 'SEO Defaults' },
  { name: 'theme', label: 'Theme' },
  { name: 'popup', label: 'Popup' },
];

/**
 * The repeating rows for `socialList`, described the way the block editor expects them — that
 * editor already draws image pickers and add/remove rows, so the settings page borrows it
 * rather than growing a second copy of the same UI.
 */
const socialListFields: BlockField[] = [
  {
    key: 'socialList',
    label: 'Social icons',
    type: 'items',
    itemFields: [
      { key: 'icon', label: 'Icon image', type: 'image' },
      { key: 'url', label: 'Link', type: 'url' },
      { key: 'label', label: 'Name (read out by screen readers)', type: 'text' },
    ],
  },
];

const values = reactive<Record<string, any>>({});
const loading = ref(true);
const saving = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const { data } = await http.get<ApiResponse<Record<string, unknown>>>('/settings');
    for (const def of defs) {
      const blank = def.type === 'switch' ? false : def.type === 'items' ? [] : '';
      values[def.key] = data.data[def.key] ?? blank;
    }
  } finally {
    loading.value = false;
  }
}
void load();

async function save(): Promise<void> {
  saving.value = true;
  try {
    await http.put('/settings', {
      settings: defs.map((d) => ({
        key: d.key,
        value:
          d.type === 'switch'
            ? !!values[d.key]
            : d.type === 'items'
              ? (values[d.key] ?? [])
              : (values[d.key] ?? ''),
        group: d.group,
      })),
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
              <!-- Repeating rows bring their own labelled card, so no ElFormItem around them. -->
              <template v-if="def.type === 'items'">
                <BlockPropsEditor
                  :fields="socialListFields"
                  :model-value="values"
                  @update:model-value="Object.assign(values, $event)"
                />
                <div v-if="def.hint" class="hint">{{ def.hint }}</div>
              </template>
              <ElFormItem v-else :label="def.label">
                <ElSwitch v-if="def.type === 'switch'" v-model="values[def.key]" />
                <MediaPicker v-else-if="def.type === 'image'" v-model="values[def.key]" />
                <ElColorPicker v-else-if="def.type === 'color'" v-model="values[def.key]" />
                <ElSelect v-else-if="def.type === 'select'" v-model="values[def.key]" style="width: 100%">
                  <ElOption v-for="o in def.options" :key="o" :value="o" :label="o" />
                </ElSelect>
                <ElInput v-else-if="def.type === 'textarea'" v-model="values[def.key]" type="textarea" :rows="2" />
                <ElInput v-else v-model="values[def.key]" />
                <div v-if="def.hint" class="hint">{{ def.hint }}</div>
              </ElFormItem>
            </template>
          </ElForm>
        </ElTabPane>
      </ElTabs>
    </ElCard>
  </div>
</template>

<style scoped>
.hint {
  /* Full width, so Element Plus's flex row drops it under the control instead of beside it. */
  width: 100%;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
</style>
