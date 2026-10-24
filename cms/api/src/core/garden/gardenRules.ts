import { BadRequestError } from '../errors/AppError.js';

/**
 * The sunflower garden's rules, kept free of the database so they can be read — and checked —
 * on their own. Everything here is a plain function of its arguments.
 */

/** How many bags a mix takes. Exactly this many, splitting 100% between them. */
export const MIX_SIZE = 2;

export interface MixPart {
  fertilizerId: number;
  pct: number;
}

/**
 * Checks a submitted mix and returns it sorted by fertiliser id, so equal mixes compare equal.
 * `allowedIds` is the event's active bags: a retired one cannot be posted by id.
 */
export function assertValidMix(parts: MixPart[], allowedIds: number[]): MixPart[] {
  if (parts.length !== MIX_SIZE) {
    throw new BadRequestError(`ต้องเลือกปุ๋ย ${MIX_SIZE} ถุง`);
  }
  const ids = new Set(parts.map((p) => p.fertilizerId));
  if (ids.size !== parts.length) throw new BadRequestError('เลือกปุ๋ยถุงเดียวกันซ้ำไม่ได้');
  for (const part of parts) {
    if (!allowedIds.includes(part.fertilizerId)) throw new BadRequestError('ไม่พบปุ๋ยที่เลือก');
    if (!Number.isInteger(part.pct) || part.pct < 1 || part.pct > 99) {
      throw new BadRequestError('สัดส่วนปุ๋ยแต่ละถุงต้องอยู่ระหว่าง 1 ถึง 99%');
    }
  }
  if (parts.reduce((sum, p) => sum + p.pct, 0) !== 100) {
    throw new BadRequestError('สัดส่วนปุ๋ยรวมกันต้องเท่ากับ 100%');
  }
  return [...parts].sort((a, b) => a.fertilizerId - b.fertilizerId);
}

export interface RecipeRule {
  id: number;
  designId: number;
  priority: number;
  ingredients: Array<{ fertilizerId: number; minPct: number; maxPct: number }>;
}

/** Whether every ingredient of the recipe is in the mix, within its range. */
export function recipeMatches(recipe: RecipeRule, mix: MixPart[]): boolean {
  if (recipe.ingredients.length === 0) return false;
  return recipe.ingredients.every((ing) => {
    const part = mix.find((p) => p.fertilizerId === ing.fertilizerId);
    return part !== undefined && part.pct >= ing.minPct && part.pct <= ing.maxPct;
  });
}

/**
 * The recipe a mix grows, or null for the event's default flower.
 *
 * When several match, the order is: higher `priority`; then the recipe naming more bags;
 * then the narrower ranges (the more deliberate rule); then the older recipe, so the answer
 * never depends on the order rows came back in.
 */
export function matchRecipe<R extends RecipeRule>(recipes: R[], mix: MixPart[]): R | null {
  const width = (r: RecipeRule) => r.ingredients.reduce((sum, i) => sum + (i.maxPct - i.minPct), 0);
  const matching = recipes.filter((r) => recipeMatches(r, mix));
  matching.sort(
    (a, b) =>
      b.priority - a.priority ||
      b.ingredients.length - a.ingredients.length ||
      width(a) - width(b) ||
      a.id - b.id,
  );
  return matching[0] ?? null;
}

export interface RevealState {
  revealAt: Date;
  revealedAt: Date | null;
}

/** Open once the reveal time passes, or as soon as an admin opens it by hand. */
export function isRevealed(event: RevealState, now: Date = new Date()): boolean {
  return event.revealedAt !== null || now.getTime() >= event.revealAt.getTime();
}

export interface DecorationRow {
  unlockAmount: { toString(): string } | number | string;
}

/**
 * Which decorations the raised amount has unlocked, and the next one still to come.
 * Compared as numbers: these are whole-baht thresholds, nothing that needs Decimal exactness.
 */
export function decorationProgress<D extends DecorationRow>(decorations: D[], raised: number) {
  const sorted = [...decorations].sort((a, b) => Number(a.unlockAmount) - Number(b.unlockAmount));
  const unlocked = sorted.filter((d) => Number(d.unlockAmount) <= raised);
  const next = sorted.find((d) => Number(d.unlockAmount) > raised) ?? null;
  return { unlocked, next };
}
