import { reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { confirmDelete } from '@/utils/confirm';
import { http } from '@/api/http';
import type { ApiResponse, PaginationMeta } from '@cms/shared';

export interface CrudOptions {
  /** API base path, e.g. '/pages' */
  endpoint: string;
  /** Extra static query params. */
  params?: Record<string, unknown>;
  immediate?: boolean;
}

/**
 * Generic server-side CRUD state: pagination, search, sorting, filters,
 * create/update/delete with confirmations. Every list view builds on this.
 */
export function useCrud<T extends { id: number }>(options: CrudOptions) {
  const items = ref<T[]>([]);
  const loading = ref(false);
  const saving = ref(false);
  const meta = ref<PaginationMeta>({ page: 1, limit: 20, total: 0, totalPages: 1 });

  const query = reactive({
    page: 1,
    limit: 20,
    search: '',
    sortBy: undefined as string | undefined,
    sortOrder: undefined as 'asc' | 'desc' | undefined,
    // `any` rather than `unknown`: these values are bound straight to form controls
    // with v-model, which cannot narrow an unknown.
    filters: {} as Record<string, any>,
  });

  async function fetchList(): Promise<void> {
    loading.value = true;
    try {
      const { data } = await http.get<ApiResponse<T[]>>(options.endpoint, {
        params: {
          page: query.page,
          limit: query.limit,
          search: query.search || undefined,
          sortBy: query.sortBy,
          sortOrder: query.sortOrder,
          ...options.params,
          ...query.filters,
        },
      });
      items.value = data.data;
      if (data.meta) meta.value = data.meta;
    } finally {
      loading.value = false;
    }
  }

  async function createItem(payload: Partial<T>): Promise<T> {
    saving.value = true;
    try {
      const { data } = await http.post<ApiResponse<T>>(options.endpoint, payload);
      ElMessage.success(data.message ?? 'Created');
      await fetchList();
      return data.data;
    } finally {
      saving.value = false;
    }
  }

  async function updateItem(id: number, payload: Partial<T>): Promise<T> {
    saving.value = true;
    try {
      const { data } = await http.put<ApiResponse<T>>(`${options.endpoint}/${id}`, payload);
      ElMessage.success(data.message ?? 'Updated');
      await fetchList();
      return data.data;
    } finally {
      saving.value = false;
    }
  }

  async function deleteItem(id: number, label = 'รายการนี้'): Promise<boolean> {
    // Single sentence on purpose: MessageBox renders plain text, so a "\n" here
    // would collapse into a space rather than break the line.
    const confirmed = await confirmDelete(label, {
      note: `ต้องการลบ "${label}" ใช่หรือไม่? ผู้ดูแลระบบสามารถกู้คืนได้ภายหลัง`,
    });
    if (!confirmed) return false;

    await http.delete(`${options.endpoint}/${id}`);
    ElMessage.success('Deleted');
    // Step back a page when the last row of the page was removed.
    if (items.value.length === 1 && query.page > 1) query.page -= 1;
    await fetchList();
    return true;
  }

  // Signature matches Element Plus's `sort-change` payload, which also passes the
  // column object; we only need prop/order.
  function onSortChange({ prop, order }: { prop?: string | null; order?: string | null }): void {
    query.sortBy = order ? (prop ?? undefined) : undefined;
    query.sortOrder = order === 'ascending' ? 'asc' : order === 'descending' ? 'desc' : undefined;
  }

  // Reset to page 1 when search/filters change; refetch on any query change.
  watch(
    () => [query.search, JSON.stringify(query.filters)],
    () => (query.page = 1),
  );
  watch(query, fetchList, { deep: true });
  if (options.immediate !== false) void fetchList();

  return { items, loading, saving, meta, query, fetchList, createItem, updateItem, deleteItem, onSortChange };
}
