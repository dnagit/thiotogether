/** Slugify a title: unicode-aware, lowercase, dash-separated. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9฀-๿]+/g, '-') // keep Thai chars
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/** Join URL segments into a normalized absolute path. */
export function joinPath(...segments: Array<string | null | undefined>): string {
  const cleaned = segments
    .filter((s): s is string => !!s)
    .map((s) => s.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean);
  return '/' + cleaned.join('/');
}

export function formatCurrency(amount: number, currency = 'THB', locale = 'th-TH'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: string | Date, locale = 'en-GB'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(date: string | Date, locale = 'en-GB'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function progressPercent(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((current / target) * 1000) / 10);
}

export function truncate(text: string, length = 120): string {
  return text.length <= length ? text : text.slice(0, length).trimEnd() + '…';
}

/** Build a flat list into a tree using parentId. Children sorted by sortOrder. */
export function buildTree<T extends { id: number; parentId?: number | null; sortOrder?: number }>(
  items: T[],
): Array<T & { children: Array<T & { children: any[] }> }> {
  type Node = T & { children: Node[] };
  const map = new Map<number, Node>();
  const roots: Node[] = [];
  for (const item of items) map.set(item.id, { ...item, children: [] });
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) map.get(node.parentId)!.children.push(node);
    else roots.push(node);
  }
  const sortRec = (nodes: Node[]) => {
    nodes.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

/** Type-safe pick. */
export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}

export function randomCode(prefix: string, length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${code}`;
}

/**
 * Whether a stored file URL points at a video.
 *
 * Galleries hold a plain URL per row rather than a media-library id, so the kind of file has
 * to be read back off the URL. That is sound here because uploads keep the original
 * extension (see `safeFileName`), and it is the only reading that also works for the rows
 * saved before video was allowed at all.
 */
const VIDEO_EXTENSIONS = /\.(mp4|webm|ogv|ogg|mov|m4v)(?:[?#]|$)/i;

export function isVideoUrl(url?: string | null): boolean {
  return !!url && VIDEO_EXTENSIONS.test(url);
}
