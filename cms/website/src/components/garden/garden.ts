/**
 * Plain helpers behind the garden pages: which growth stage the field is at, the countdown,
 * and where each plant stands in the field.
 */
import type { Garden, GrowthStage } from '@/api/garden';

const DAY = 86_400_000;

/**
 * The phone's clock corrected by the server's. Countdowns and growth stages are about one
 * shared moment, and a phone set a day wrong would show the wrong stage.
 */
export function clockOffset(garden: Pick<Garden, 'serverTime'>): number {
  return new Date(garden.serverTime).getTime() - Date.now();
}

/**
 * The stage a plant shows today.
 *
 * Stages are ordered from the earliest (the most days before the reveal) and each holds until
 * the next begins. A seed sown less than a day ago shows the first stage whatever the date —
 * a seed that had only just gone in should not already be in bud.
 */
export function stageFor(
  stages: GrowthStage[],
  revealAt: string,
  plantedAt: string | null,
  now: number,
): GrowthStage | null {
  if (!stages.length) return null;
  const ordered = [...stages].sort((a, b) => b.startsDaysBeforeReveal - a.startsDaysBeforeReveal);
  if (plantedAt && now - new Date(plantedAt).getTime() < DAY) return ordered[0];
  const daysLeft = (new Date(revealAt).getTime() - now) / DAY;
  let current = ordered[0];
  for (const stage of ordered) if (stage.startsDaysBeforeReveal >= daysLeft) current = stage;
  return current;
}

/**
 * Where the built-in drawing is, when the admin has uploaded no stages: 0 a seed, 1 a sprout,
 * 2 a stem with leaves, 3 a bud. Spread over the last year before the reveal.
 */
export function builtinStage(revealAt: string, plantedAt: string | null, now: number): number {
  if (plantedAt && now - new Date(plantedAt).getTime() < DAY) return 0;
  const daysLeft = (new Date(revealAt).getTime() - now) / DAY;
  if (daysLeft > 240) return 0;
  if (daysLeft > 120) return 1;
  if (daysLeft > 30) return 2;
  return 3;
}

export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

export function countdown(revealAt: string, now: number): Countdown {
  const left = Math.max(0, new Date(revealAt).getTime() - now);
  return {
    days: Math.floor(left / DAY),
    hours: Math.floor((left % DAY) / 3_600_000),
    minutes: Math.floor((left % 3_600_000) / 60_000),
    seconds: Math.floor((left % 60_000) / 1000),
    done: left === 0,
  };
}

/** "20 กันยายน 2570" style, in Thai with the Buddhist year, as the posters write it. */
export function thaiDate(value: string): string {
  return new Date(value).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Bangkok',
  });
}

export const RARITY_LABEL: Record<string, string> = {
  common: 'ธรรมดา',
  rare: 'หายาก',
  legendary: 'ตำนาน',
};

/**
 * A number from 0 to 1 that is always the same for the same seed — mulberry32. Plants are
 * nudged off the grid by it, so the field looks sown by hand and still never rearranges.
 */
export function seeded(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export interface PlotSpot {
  /** Centre of the plant's foot, as a percentage of the field's width. */
  x: number;
  /** Foot of the plant, in field widths from the top of the field. */
  y: number;
  /** Plant width, as a percentage of the field's width. */
  width: number;
  /** Paint order: rows further down stand in front. */
  z: number;
}

/**
 * Where plot number `n` stands. Rows of `perRow`, filled left to right from the back of the
 * field; every other row is offset by half a plant, and each plant is nudged a little by
 * {@link seeded}. Depends only on `n` and `perRow`, so a plant never moves when others are
 * added — and a removed plant leaves its gap.
 */
export function plotSpot(n: number, perRow: number, top: number): PlotSpot {
  const index = n - 1;
  const row = Math.floor(index / perRow);
  const col = index % perRow;
  const cell = 100 / perRow;
  const offset = row % 2 ? cell / 2 : cell / 4;
  const jx = (seeded(n * 2) - 0.5) * cell * 0.35;
  const jy = (seeded(n * 2 + 1) - 0.5) * 0.25;
  const rowHeight = (cell / 100) * 0.9;
  const width = cell * 1.15;
  // Kept clear of the edges by half a plant, so the end of a row is not cut off.
  const half = width / 2;
  return {
    x: Math.min(100 - half, Math.max(half, offset + col * cell + jx)),
    y: top + (row + 1 + jy * 0.5) * rowHeight,
    width,
    z: row * 2 + 1,
  };
}

/** Rows of plants a field of this many plots needs, for sizing the field. */
export function fieldRows(lastPlot: number, perRow: number): number {
  return Math.max(1, Math.ceil(lastPlot / perRow));
}
