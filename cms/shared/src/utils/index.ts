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

// ── JOOX voting day ──────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
/** 23:00 in Bangkok is 16:00 UTC. Thailand keeps no daylight saving, so this never moves. */
const JOOX_RESET_OFFSET_MS = 16 * 60 * 60 * 1000;

/**
 * Number of the JOOX voting day `at` falls in. A day starts at 23:00 Thai time, when JOOX
 * opens a fresh round of votes — and when the checklist's click counts and "done" marks
 * start over with it.
 *
 * Plain arithmetic on the UTC timestamp, so the server's own time zone never enters into it.
 */
export function jooxVoteDay(at: number | Date = Date.now()): number {
  const ms = typeof at === 'number' ? at : at.getTime();
  return Math.floor((ms - JOOX_RESET_OFFSET_MS) / DAY_MS);
}

/** When the voting day containing `at` ends: the next 23:00 Thai time. */
export function jooxVoteResetAt(at: number | Date = Date.now()): Date {
  return new Date((jooxVoteDay(at) + 1) * DAY_MS + JOOX_RESET_OFFSET_MS);
}

/**
 * Vote-link opens that make an account done for the day. The third tap marks it done by
 * itself; someone who knows some of those taps didn't become votes can say how many are
 * missing, which takes the count back down and leaves it open until it reaches this again.
 */
export const JOOX_VOTE_TARGET = 3;

/**
 * Votes one JOOX account can cast in a voting day. Tracked per account on `/joox-accounts`, and
 * given back with everything else at the 23:00 reset.
 */
export const JOOX_VOTES_PER_ACCOUNT = 6;

/**
 * The form of a JOOX login that duplicates are judged on. An email is compared lowercased; a
 * phone number by its digits alone, with a Thai +66 written the local way, so "081-234-5678"
 * and "+66 81 234 5678" are one account.
 */
export function jooxAccountUserKey(user: string): string {
  const value = user.normalize('NFC').trim();
  if (value.includes('@')) return value.toLowerCase();
  const digits = value.replace(/\D/g, '');
  return digits.startsWith('66') && digits.length === 11 ? `0${digits.slice(2)}` : digits;
}

/** An email, or a phone number: 9–15 digits, with the spaces, dashes, dots and + people type. */
export function isJooxAccountUser(user: string): boolean {
  const value = user.trim();
  if (value.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (!/^\+?[\d\s().-]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, '').length;
  return digits >= 9 && digits <= 15;
}

/**
 * Everything pasted in front of the link itself — share text like "มาโหวตกัน! https://…" —
 * dropped, so the field is left holding the URL. Text with no http(s):// in it comes back as is.
 */
export function stripBeforeJooxLink(text: string): string {
  const start = text.search(/https?:\/\//i);
  return start > 0 ? text.slice(start) : text;
}

/**
 * The form of an account name that duplicates are judged on: case, surrounding space and
 * runs of inner space ignored, so "Main", "main " and "MAIN" are one account. NFC so that
 * text typed as different code-point sequences for the same letters compares equal.
 */
export function jooxNameKey(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * The form of a vote link that duplicates are judged on: as the browser reads it — host case
 * and default ports ironed out by `URL` — with a trailing slash ignored. Nothing else is
 * stripped: the query and the hash can be exactly what tells one vote link from another.
 */
export function jooxLinkKey(link: string): string {
  try {
    return new URL(link.trim()).href.replace(/\/$/, '');
  } catch {
    return link.trim();
  }
}
