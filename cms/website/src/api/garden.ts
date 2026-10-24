/**
 * Sunflower garden — the website's half of the contract.
 *
 *   GET  /public/garden/:slug                    → the garden, its bags, stages and decorations
 *   GET  /public/garden/:slug/plants?after=      → the field, a page at a time
 *   GET  /public/garden/:slug/plants/:id         → one plant's card
 *   POST /public/garden/:slug/plants             → sow; the first sow hands back a gardener key
 *   GET  /public/garden/:slug/mine               → this browser's own plants
 *   GET  /public/garden/:slug/shelf              → the secret shelf
 *   POST /public/garden/:slug/tokens             → tokens a donation account holds here
 *   POST /public/garden/:slug/plants/:id/secret  → buy secret fertiliser for one plant
 *
 * There is no login. The first seed sown from a browser comes back with a random key, kept in
 * `localStorage` per garden and sent as `x-garden-key`; it is what opens "my garden". The same
 * key in a link (`/garden/mine/:slug#key=…`) opens the garden on another device — in the
 * fragment, so it never reaches a server log.
 *
 * A flower's look is not in any response before the reveal, except a secret flower its owner
 * chose — the API holds that line; this file only carries what it is given.
 */
import { api, get } from '@/api/client';

export interface Fertilizer {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  color: string;
}

export interface GrowthStage {
  id: number;
  name: string;
  imageUrl: string;
  startsDaysBeforeReveal: number;
}

export interface Decoration {
  id: number;
  name: string;
  imageUrl: string;
  posX: number;
  posY: number;
  size: number;
}

export interface Garden {
  slug: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  fieldImage: string | null;
  themeColor: string | null;
  revealAt: string;
  revealed: boolean;
  /** The server's clock when it answered, so countdowns do not trust the phone's. */
  serverTime: string;
  isOpen: boolean;
  plantCount: number;
  fertilizers: Fertilizer[];
  growthStages: GrowthStage[];
  decorations: Decoration[];
  nextDecoration:
    | { name: string; raised: number; unlockAmount: number }
    | { name: string; percent: number }
    | null;
  shelf: {
    enabled: boolean;
    price: number;
    donationSlug: string | null;
    donationName: string | null;
  };
}

export interface Flower {
  id: number;
  name: string;
  imageUrl: string;
  rarity: 'common' | 'rare' | 'legendary' | string;
  /** Where a face sits: centre and diameter, as percentages of the picture's width. */
  faceX: number | null;
  faceY: number | null;
  faceSize: number | null;
}

export interface MixPart {
  id: number;
  name: string;
  color: string;
  imageUrl: string | null;
  pct: number;
}

export interface Plant {
  id: number;
  plotIndex: number;
  name: string;
  plantedAt: string;
  /** Null until the reveal — or, for its owner, the secret flower they chose. */
  flower: Flower | null;
  face: { imageUrl: string } | null;
  /** Absent on the field, where hundreds are listed at once. */
  message?: string;
  fertilizers?: MixPart[];
  /** Only told to the owner before the reveal. */
  hasSecret?: boolean;
}

export interface ShelfFlower {
  id: number;
  name: string;
  imageUrl: string;
  rarity: string;
  allowFace: boolean;
}

const base = (slug: string) => `/garden/${encodeURIComponent(slug)}`;

// ── Gardener key ───────────────────────────────────────────

const keyName = (slug: string) => `garden.${slug}.key`;

/** Private-mode Safari throws on `localStorage`; the page must still work for this visit. */
const memory = new Map<string, string>();

export function gardenerKey(slug: string): string | null {
  try {
    return localStorage.getItem(keyName(slug)) ?? memory.get(slug) ?? null;
  } catch {
    return memory.get(slug) ?? null;
  }
}

export function setGardenerKey(slug: string, key: string): void {
  memory.set(slug, key);
  try {
    localStorage.setItem(keyName(slug), key);
  } catch {
    // Kept in memory only: the garden won't outlive the tab, and the recovery link says so.
  }
}

/** The link that opens this browser's garden anywhere. Treat it like a password. */
export function recoveryLink(slug: string, key: string): string {
  return `${window.location.origin}/garden/mine/${encodeURIComponent(slug)}#key=${key}`;
}

const withKey = (slug: string) => {
  const key = gardenerKey(slug);
  return key ? { headers: { 'x-garden-key': key } } : {};
};

// ── Calls ──────────────────────────────────────────────────

export async function fetchGarden(slug: string): Promise<Garden> {
  return get<Garden>(base(slug));
}

/** Every visible plant, fetched page by page. `full` adds messages and mixes. */
export async function fetchField(slug: string, full = false): Promise<Plant[]> {
  const plants: Plant[] = [];
  let after: number | null = 0;
  while (after !== null) {
    const page: { plants: Plant[]; nextAfter: number | null } = await get(`${base(slug)}/plants`, {
      after,
      full: full ? 1 : undefined,
    });
    plants.push(...page.plants);
    after = page.nextAfter;
  }
  return plants;
}

export async function fetchPlant(slug: string, id: number): Promise<Plant> {
  const { data } = await api.get(`/public${base(slug)}/plants/${id}`, withKey(slug));
  return data.data;
}

export async function fetchMine(slug: string): Promise<Plant[]> {
  const { data } = await api.get(`/public${base(slug)}/mine`, withKey(slug));
  return data.data.plants;
}

export interface SowDraft {
  name: string;
  message: string;
  fertilizers: Array<{ fertilizerId: number; pct: number }>;
}

export async function sow(
  slug: string,
  draft: SowDraft,
): Promise<{ plant: Plant; message: string }> {
  const { data } = await api.post(`/public${base(slug)}/plants`, draft, withKey(slug));
  if (data.data.gardenerKey) setGardenerKey(slug, data.data.gardenerKey);
  return { plant: data.data.plant, message: data.message };
}

export async function fetchShelf(
  slug: string,
): Promise<{ enabled: boolean; price: number; designs: ShelfFlower[] }> {
  return get(`${base(slug)}/shelf`);
}

export async function checkTokens(
  slug: string,
  accountName: string,
): Promise<{ found: boolean; displayName: string; tokens: number }> {
  const { data } = await api.post(`/public${base(slug)}/tokens`, { accountName });
  return data.data;
}

export async function buySecret(
  slug: string,
  plantId: number,
  body: { designId: number; accountName: string; idempotencyKey: string },
): Promise<{ plant: Plant; remainingTokens: number; message: string }> {
  const { data } = await api.post(
    `/public${base(slug)}/plants/${plantId}/secret`,
    body,
    withKey(slug),
  );
  return { ...data.data, message: data.message };
}

/** The API's error message, for showing as-is: every one of them is written for visitors. */
export function errorMessage(err: unknown, fallback = 'เกิดข้อผิดพลาด กรุณาลองใหม่'): string {
  const message = (err as any)?.response?.data?.message;
  return typeof message === 'string' && message ? message : fallback;
}
