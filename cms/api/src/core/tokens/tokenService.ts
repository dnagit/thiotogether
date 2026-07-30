import { Prisma } from '@prisma/client';
import { rawPrisma } from '../database/prisma.js';
import { BadRequestError } from '../errors/AppError.js';
import { calculateTokens } from './tokenMath.js';
import { cleanDisplayName, normalizeAccountName } from './accountName.js';
import { logger } from '../logger.js';

/**
 * Token accounting. Two invariants hold everywhere in this file:
 *
 *  1. Every change to `tokens_remaining` is accompanied by a ledger row in the same
 *     transaction, so the ledger can always reconstruct the balance.
 *  2. Grants are keyed by donation id, so re-approving a submission is a no-op.
 *
 * Uses `rawPrisma` (the un-extended client) because these run inside explicit
 * transactions where the soft-delete extension's implicit `where` rewriting would
 * fight with row-level locking.
 */

type Tx = Prisma.TransactionClient;

/** Find-or-create the identity for a typed account name. */
export async function resolveAccountIdentity(rawName: string, tx: Tx = rawPrisma) {
  const normalizedName = normalizeAccountName(rawName);
  const displayName = cleanDisplayName(rawName);

  if (!normalizedName) throw new BadRequestError('กรุณากรอกชื่อบัญชี');

  // Upsert keeps the newest spelling as the display name without forking identities.
  return tx.accountIdentity.upsert({
    where: { normalizedName },
    create: { normalizedName, displayName },
    update: { displayName },
  });
}

/** Look up an identity without creating one. */
export async function findAccountIdentity(rawName: string, tx: Tx = rawPrisma) {
  const normalizedName = normalizeAccountName(rawName);
  if (!normalizedName) return null;
  return tx.accountIdentity.findUnique({ where: { normalizedName } });
}

export interface GrantResult {
  granted: boolean;
  tokens: number;
  reason?: 'already_granted' | 'project_has_no_token_value' | 'amount_below_token_value';
}

/**
 * Mint tokens for an approved donation. Safe to call repeatedly: the unique
 * constraint on `token_grants.donation_id` means a second call for the same
 * donation returns `already_granted` instead of minting again.
 */
export async function grantTokensForDonation(
  donationId: number,
  actorId: number | null,
  client: Tx = rawPrisma,
): Promise<GrantResult> {
  const donation = await client.donation.findUnique({
    where: { id: donationId },
    include: { project: true },
  });
  if (!donation) throw new BadRequestError('ไม่พบรายการบริจาค');

  const existing = await client.tokenGrant.findUnique({ where: { donationId } });
  if (existing) return { granted: false, tokens: existing.tokensGranted, reason: 'already_granted' };

  const tokenValue = donation.project.tokenValue;
  if (!tokenValue || new Prisma.Decimal(tokenValue).lessThanOrEqualTo(0)) {
    return { granted: false, tokens: 0, reason: 'project_has_no_token_value' };
  }

  const { tokens, remainder } = calculateTokens(donation.amount, tokenValue);
  if (tokens <= 0) {
    return { granted: false, tokens: 0, reason: 'amount_below_token_value' };
  }

  const identity = donation.accountIdentityId
    ? await client.accountIdentity.findUniqueOrThrow({ where: { id: donation.accountIdentityId } })
    : await resolveAccountIdentity(donation.accountName, client);

  const expiresAt = donation.project.tokenTtlDays
    ? new Date(Date.now() + donation.project.tokenTtlDays * 86_400_000)
    : null;

  try {
    const grant = await client.tokenGrant.create({
      data: {
        accountIdentityId: identity.id,
        projectId: donation.projectId,
        donationId: donation.id,
        tokensGranted: tokens,
        tokensRemaining: tokens,
        tokenValueAtGrant: tokenValue,
        donationAmount: donation.amount,
        remainderAmount: remainder,
        expiresAt,
      },
    });

    await client.tokenLedgerEntry.create({
      data: {
        accountIdentityId: identity.id,
        projectId: donation.projectId,
        grantId: grant.id,
        delta: tokens,
        reason: 'GRANT',
        description: `อนุมัติการบริจาค ${donation.donationCode}`,
        actorId,
      },
    });

    if (!donation.accountIdentityId) {
      await client.donation.update({
        where: { id: donation.id },
        data: { accountIdentityId: identity.id },
      });
    }

    return { granted: true, tokens };
  } catch (err) {
    // Lost a race with a concurrent approval — the other one minted, we must not.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await client.tokenGrant.findUnique({ where: { donationId } });
      return { granted: false, tokens: winner?.tokensGranted ?? 0, reason: 'already_granted' };
    }
    throw err;
  }
}

/** Revoke the tokens from a donation that is being un-approved (rejected/cancelled). */
export async function revokeTokensForDonation(
  donationId: number,
  actorId: number | null,
  client: Tx = rawPrisma,
): Promise<{ revoked: number; shortfall: number }> {
  const grant = await client.tokenGrant.findUnique({ where: { donationId } });
  if (!grant) return { revoked: 0, shortfall: 0 };

  // Tokens already spent on reservations cannot be clawed back — the tile is taken.
  // Record the shortfall rather than letting the balance go negative.
  const revoked = grant.tokensRemaining;
  const shortfall = grant.tokensGranted - grant.tokensRemaining;

  if (revoked > 0) {
    await client.tokenGrant.update({
      where: { id: grant.id },
      data: { tokensRemaining: 0 },
    });
    await client.tokenLedgerEntry.create({
      data: {
        accountIdentityId: grant.accountIdentityId,
        projectId: grant.projectId,
        grantId: grant.id,
        delta: -revoked,
        reason: 'REVOKE',
        description: `ยกเลิกการอนุมัติการบริจาค (คืน ${revoked} token)`,
        actorId,
      },
    });
  }

  if (shortfall > 0) {
    logger.warn(
      { donationId, shortfall },
      'Donation un-approved after tokens were already spent; reservations left intact',
    );
  }

  return { revoked, shortfall };
}

export interface Balance {
  total: number;
  byProject: Array<{ projectId: number; projectName: string; tokens: number }>;
}

/** Spendable balance, optionally restricted to the projects a game accepts. */
export async function getBalance(
  accountIdentityId: number,
  projectIds?: number[],
  client: Tx = rawPrisma,
): Promise<Balance> {
  const grants = await client.tokenGrant.findMany({
    where: {
      accountIdentityId,
      tokensRemaining: { gt: 0 },
      deletedAt: null,
      ...(projectIds ? { projectId: { in: projectIds } } : {}),
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: { project: { select: { id: true, name: true } } },
  });

  const byProject = new Map<number, { projectId: number; projectName: string; tokens: number }>();
  for (const g of grants) {
    const row = byProject.get(g.projectId) ?? {
      projectId: g.projectId,
      projectName: g.project.name,
      tokens: 0,
    };
    row.tokens += g.tokensRemaining;
    byProject.set(g.projectId, row);
  }

  return {
    total: grants.reduce((sum, g) => sum + g.tokensRemaining, 0),
    byProject: [...byProject.values()].sort((a, b) => b.tokens - a.tokens),
  };
}

interface LockedGrant {
  id: number;
  project_id: number;
  tokens_remaining: number;
}

/**
 * Spend `amount` tokens, taking soonest-to-expire first and then oldest-first (FIFO).
 *
 * MUST be called inside a transaction: it takes `FOR UPDATE` row locks on the
 * candidate grants so two concurrent reservations cannot both see the same tokens
 * as available. Throws rather than ever writing a negative balance.
 */
export async function spendTokens(
  tx: Tx,
  params: {
    accountIdentityId: number;
    projectIds: number[];
    amount: number;
    reservationId?: number;
    description: string;
  },
): Promise<Array<{ grantId: number; projectId: number; tokens: number }>> {
  const { accountIdentityId, projectIds, amount } = params;
  if (amount <= 0) throw new BadRequestError('จำนวน token ต้องมากกว่า 0');
  if (projectIds.length === 0) throw new BadRequestError('เกมนี้ยังไม่ได้ผูกกับโครงการบริจาคใด');

  // Lock the spendable grants in the exact order we intend to consume them.
  // NULLS LAST puts never-expiring tokens after expiring ones, so the tokens that
  // would be lost soonest are used first.
  const locked = await tx.$queryRaw<LockedGrant[]>`
    SELECT id, project_id, tokens_remaining
    FROM token_grants
    WHERE account_identity_id = ${accountIdentityId}
      AND project_id = ANY(${projectIds}::int[])
      AND tokens_remaining > 0
      AND deleted_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY expires_at ASC NULLS LAST, created_at ASC, id ASC
    FOR UPDATE
  `;

  const available = locked.reduce((sum, g) => sum + g.tokens_remaining, 0);
  if (available < amount) {
    throw new BadRequestError(`Token ไม่เพียงพอ (มี ${available} ต้องใช้ ${amount})`);
  }

  const spends: Array<{ grantId: number; projectId: number; tokens: number }> = [];
  let left = amount;

  for (const grant of locked) {
    if (left <= 0) break;
    const take = Math.min(left, grant.tokens_remaining);

    // Guarded update: the WHERE clause re-checks the balance, so even if the lock
    // were somehow bypassed the row can never go negative.
    const updated = await tx.tokenGrant.updateMany({
      where: { id: grant.id, tokensRemaining: { gte: take } },
      data: { tokensRemaining: { decrement: take } },
    });
    if (updated.count !== 1) {
      throw new BadRequestError('Token ถูกใช้ไปพร้อมกันจากอีกอุปกรณ์ กรุณาลองใหม่');
    }

    await tx.tokenLedgerEntry.create({
      data: {
        accountIdentityId,
        projectId: grant.project_id,
        grantId: grant.id,
        reservationId: params.reservationId,
        delta: -take,
        reason: 'SPEND',
        description: params.description,
      },
    });

    spends.push({ grantId: grant.id, projectId: grant.project_id, tokens: take });
    left -= take;
  }

  if (left > 0) throw new BadRequestError('Token ไม่เพียงพอ');
  return spends;
}
