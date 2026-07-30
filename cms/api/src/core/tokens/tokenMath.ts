import { Prisma } from '@prisma/client';

export interface TokenCalculation {
  tokens: number;
  /** Money left over that did not buy a whole token. Audit only — never carried forward. */
  remainder: Prisma.Decimal;
}

/**
 * Tokens earned by ONE donation submission: floor(amount / tokenValue).
 *
 * Deliberately per-submission. Two 120฿ and 130฿ donations at 50฿/token yield
 * 2 + 2 = 4 tokens, not floor(250/50) = 5 — the 20฿ and 30฿ remainders are not
 * poolable. Callers must never sum amounts before calling this.
 *
 * All arithmetic is Decimal; money never touches a float.
 */
export function calculateTokens(
  donationAmount: Prisma.Decimal | string | number,
  tokenValue: Prisma.Decimal | string | number,
): TokenCalculation {
  const amount = new Prisma.Decimal(donationAmount);
  const perToken = new Prisma.Decimal(tokenValue);

  if (perToken.lessThanOrEqualTo(0)) {
    throw new Error('tokenValue must be greater than zero');
  }
  if (amount.lessThanOrEqualTo(0)) {
    return { tokens: 0, remainder: new Prisma.Decimal(0) };
  }

  const tokens = amount.dividedBy(perToken).floor();
  const remainder = amount.minus(tokens.times(perToken));

  return { tokens: tokens.toNumber(), remainder };
}
