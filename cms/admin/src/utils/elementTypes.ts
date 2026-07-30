/**
 * Element Plus props are literal unions, but the status→variant maps in the views
 * are keyed lookups that TypeScript widens to `string`. These aliases let a helper
 * declare the narrow type it actually returns.
 */
export type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger';

/** Build a status→tag-type lookup that keeps its literal type through indexing. */
export function tagMapper<K extends string>(
  map: Record<K, ElTagType>,
  fallback: ElTagType = 'info',
): (key: string) => ElTagType {
  return (key: string) => map[key as K] ?? fallback;
}
