import { ElMessage } from 'element-plus';
import { http } from '@/api/http';
import type { ApiResponse } from '@cms/shared';

/**
 * The garden's catalogues are all saved the same way: the whole list, in order, to
 * `PUT /garden/:id/<name>`, rows keeping their id. The API answers with the whole event,
 * which the tab hands up so every other tab sees the saved lists.
 */
export async function saveCatalogue(eventId: number, name: string, rows: unknown[]): Promise<any> {
  const { data } = await http.put<ApiResponse<any>>(`/garden/${eventId}/${name}`, { [name]: rows });
  ElMessage.success('บันทึกแล้ว');
  return data.data;
}

/** Moves a row up or down, for lists whose order is what the website shows. */
export function moveRow<T>(list: T[], index: number, delta: number): void {
  const target = index + delta;
  if (target < 0 || target >= list.length) return;
  const [row] = list.splice(index, 1);
  list.splice(target, 0, row);
}

/**
 * A row's editable fields, without what only the server sets. Absent ones stay absent — a new
 * row has no id, and sending `id: null` would fail validation rather than create it.
 */
export function pick<T extends Record<string, any>>(
  row: T,
  keys: readonly string[],
): Record<string, any> {
  return Object.fromEntries(
    keys.filter((key) => row[key] !== undefined).map((key) => [key, row[key]]),
  );
}
