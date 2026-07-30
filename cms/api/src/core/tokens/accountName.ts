import { BadRequestError } from '../errors/AppError.js';

/**
 * Players have no login: the account name typed into a donation form *is* their
 * identity, and they retype it before playing. Two spellings of the same name must
 * therefore resolve to one account, so every lookup goes through `normalizeAccountName`
 * and compares the normalized form — the raw spelling is kept only for display.
 */

/**
 * Zero-width and bidi marks that survive a naive trim and would fork an identity.
 * Written as escapes deliberately — as literals they are invisible in the source.
 * U+200B..U+200F zero-width/bidi, U+202A..U+202E embedding, U+2060 word joiner,
 * U+FEFF BOM.
 */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g;

export function normalizeAccountName(raw: string): string {
  return (
    raw
      .normalize('NFKC')
      .replace(INVISIBLE, '')
      // Every kind of whitespace collapses to a single ASCII space.
      .replace(/\s+/gu, ' ')
      .trim()
      .toLocaleLowerCase('th-TH')
  );
}

/** The spelling shown back to users: whitespace tidied, original casing kept. */
export function cleanDisplayName(raw: string): string {
  return raw.normalize('NFKC').replace(INVISIBLE, '').replace(/\s+/gu, ' ').trim();
}

export const ACCOUNT_NAME_MIN = 2;
export const ACCOUNT_NAME_MAX = 190;

/**
 * Validate against the built-in rules plus an optional admin-configured pattern
 * (settings key `account_name_pattern`). Throws a Thai message aimed at the player.
 */
export function assertValidAccountName(raw: string, adminPattern?: string | null): string {
  const display = cleanDisplayName(raw);

  if (display.length < ACCOUNT_NAME_MIN) {
    throw new BadRequestError(`ชื่อบัญชีต้องมีอย่างน้อย ${ACCOUNT_NAME_MIN} ตัวอักษร`);
  }
  if (display.length > ACCOUNT_NAME_MAX) {
    throw new BadRequestError(`ชื่อบัญชีต้องยาวไม่เกิน ${ACCOUNT_NAME_MAX} ตัวอักษร`);
  }
  if (adminPattern) {
    let re: RegExp;
    try {
      re = new RegExp(adminPattern, 'u');
    } catch {
      // A malformed admin pattern must not lock every player out of the game.
      return display;
    }
    if (!re.test(display)) {
      throw new BadRequestError('รูปแบบชื่อบัญชีไม่ถูกต้องตามที่ผู้ดูแลระบบกำหนด');
    }
  }
  return display;
}
