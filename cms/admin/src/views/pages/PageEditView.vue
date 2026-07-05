<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { http } from '@/api/http';
import MediaPicker from '@/components/MediaPicker.vue';
import { slugify, type ApiResponse, type Page, type PageTreeNode } from '@cms/shared';

const route = useRoute();
const router = useRouter();
const id = computed(() => (route.params.id ? Number(route.params.id) : null));
const isNew = computed(() => id.value === null);

const form = reactive<Partial<Page>>({
  title: '',
  slug: '',
  parentId: null,
  status: 'DRAFT',
  sortOrder: 0,
  isHome: false,
  featuredImage: null,
  bannerImage: null,
  metaTitle: '',
  metaDescription: '',
  canonicalUrl: '',
  ogImage: '',
  noIndex: false,
});
const saving = ref(false);
const slugTouched = ref(false);
const parentOptions = ref<Array<{ value: number; label: string }>>([]);

function flattenTree(nodes: PageTreeNode[], depth = 0): Array<{ value: number; label: string }> {
  return nodes.flatMap((n) => [
    { value: n.id, label: `${'— '.repeat(depth)}${n.title}` },
    ...flattenTree(n.children ?? [], depth + 1),
  ]);
}

async function load(): Promise<void> {
  const { data: treeData } = await http.get<ApiResponse<PageTreeNode[]>>('/pages/tree');
  parentOptions.value = flattenTree(treeData.data).filter((o) => o.value !== id.value);

  if (!isNew.value) {
    const { data } = await http.get<ApiResponse<Page>>(`/pages/${id.value}`);
    Object.assign(form, data.data);
    slugTouched.value = true;
  }
}
void load();

function onTitleInput(): void {
  if (!slugTouched.value) form.slug = slugify(form.title ?? '');
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    const payload = { ...form };
    delete (payload as any).id;
    delete (payload as any).path;
    delete (payload as any).blocks;
    delete (payload as any).createdAt;
    delete (payload as any).updatedAt;
    delete (payload as any).deletedAt;
    delete (payload as any).parent;
    delete (payload as any).children;

    if (isNew.value) {
      const { data } = await http.post<ApiResponse<Page>>('/pages', payload);
      ElMessage.success('Page created');
      void router.push({ name: 'page-builder', params: { id: data.data.id } });
    } else {
      await http.put(`/pages/${id.value}`, payload);
      ElMessage.success('Page saved');
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>{{ isNew ? 'New Page' : `Edit: ${form.title}` }}</h1>
      <div>
        <ElButton @click="router.back()">Cancel</ElButton>
        <ElButton v-if="!isNew" plain @click="router.push({ name: 'page-builder', params: { id } })">Open Builder</ElButton>
        <ElButton type="primary" :loading="saving" @click="save">Save</ElButton>
      </div>
    </div>

    <ElRow :gutter="16">
      <ElCol :xs="24" :md="16">
        <ElCard header="Content">
          <ElForm label-position="top">
            <ElFormItem label="Title" required>
              <ElInput v-model="form.title" @input="onTitleInput" />
            </ElFormItem>
            <ElFormItem label="Slug" required>
              <ElInput v-model="form.slug" @input="slugTouched = true">
                <template #prepend>/</template>
              </ElInput>
            </ElFormItem>
            <ElFormItem label="Parent Page">
              <ElSelect v-model="form.parentId" clearable filterable placeholder="(top level)" style="width: 100%">
                <ElOption v-for="o in parentOptions" :key="o.value" :value="o.value" :label="o.label" />
              </ElSelect>
              <div v-if="!isNew" class="text-muted">Current URL: <code>{{ form.path }}</code> — changing parent or slug updates all child URLs.</div>
            </ElFormItem>
          </ElForm>
        </ElCard>

        <ElCard header="SEO" class="mt">
          <ElForm label-position="top">
            <ElFormItem label="Meta Title"><ElInput v-model="form.metaTitle" maxlength="255" show-word-limit /></ElFormItem>
            <ElFormItem label="Meta Description"><ElInput v-model="form.metaDescription" type="textarea" :rows="2" maxlength="500" show-word-limit /></ElFormItem>
            <ElFormItem label="Canonical URL"><ElInput v-model="form.canonicalUrl" /></ElFormItem>
            <ElFormItem label="Open Graph Image"><MediaPicker v-model="form.ogImage" /></ElFormItem>
            <ElFormItem><ElCheckbox v-model="form.noIndex">Exclude from search engines (noindex)</ElCheckbox></ElFormItem>
          </ElForm>
        </ElCard>
      </ElCol>

      <ElCol :xs="24" :md="8">
        <ElCard header="Publish">
          <ElForm label-position="top">
            <ElFormItem label="Status">
              <ElSelect v-model="form.status" style="width: 100%">
                <ElOption value="DRAFT" label="Draft" />
                <ElOption value="PUBLISHED" label="Published" />
                <ElOption value="ARCHIVED" label="Archived" />
              </ElSelect>
            </ElFormItem>
            <ElFormItem label="Publish Date">
              <ElDatePicker v-model="form.publishedAt" type="datetime" style="width: 100%" />
            </ElFormItem>
            <ElFormItem label="Sort Order"><ElInputNumber v-model="form.sortOrder" /></ElFormItem>
            <ElFormItem><ElCheckbox v-model="form.isHome">Use as homepage (/)</ElCheckbox></ElFormItem>
          </ElForm>
        </ElCard>

        <ElCard header="Images" class="mt">
          <ElForm label-position="top">
            <ElFormItem label="Featured Image"><MediaPicker v-model="form.featuredImage" /></ElFormItem>
            <ElFormItem label="Banner"><MediaPicker v-model="form.bannerImage" /></ElFormItem>
          </ElForm>
        </ElCard>
      </ElCol>
    </ElRow>
  </div>
</template>

<style scoped>
.mt { margin-top: 16px; }
</style>
