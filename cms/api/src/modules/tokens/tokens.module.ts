import { z } from 'zod';
import { Router } from 'express';
import { rawPrisma } from '../../core/database/prisma.js';
import { authenticate } from '../../core/middleware/authenticate.js';
import { authorize } from '../../core/middleware/authorize.js';
import { validate } from '../../core/middleware/validate.js';
import { audit } from '../../core/middleware/audit.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { ok } from '../../core/base/BaseController.js';
import { BadRequestError, NotFoundError } from '../../core/errors/AppError.js';
import { parseListQuery, paginationMeta } from '../../core/utils/pagination.js';
import { normalizeAccountName } from '../../core/tokens/accountName.js';
import { logger } from '../../core/logger.js';
import { DonationStatus, PERMISSIONS } from '@cms/shared';
import type { FeatureModule } from '../../core/modules.js';

/**
 * Admin views over the token system: who holds what, why, and the full immutable
 * history. Read-only apart from a deliberate manual adjustment endpoint, which
 * always writes a ledger entry naming the actor.
 */

const router = Router();
router.use(authenticate, audit('tokens'));

/** Spendable balance expression reused by the account list and detail views. */
const spendableWhere = () => ({
  tokensRemaining: { gt: 0 },
  deletedAt: null,
  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
});

router.get(
  '/accounts',
  authorize(PERMISSIONS.TOKENS_VIEW),
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const where = query.search
      ? { normalizedName: { contains: normalizeAccountName(query.search) } }
      : {};

    const [items, total] = await Promise.all([
      rawPrisma.accountIdentity.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
        include: {
          _count: { select: { donations: true, reservations: true } },
          tokenGrants: { where: spendableWhere(), select: { tokensRemaining: true } },
        },
      }),
      rawPrisma.accountIdentity.count({ where }),
    ]);

    ok(
      res,
      items.map(({ tokenGrants, _count, ...a }) => ({
        ...a,
        spendableTokens: tokenGrants.reduce((s, g) => s + g.tokensRemaining, 0),
        donationCount: _count.donations,
        reservationCount: _count.reservations,
      })),
      undefined,
      paginationMeta(query.page, query.limit, total),
    );
  }),
);

/** Full history for one account: grants, ledger and reservations. */
router.get(
  '/accounts/:id(\\d+)',
  authorize(PERMISSIONS.TOKENS_VIEW),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const account = await rawPrisma.accountIdentity.findUnique({ where: { id } });
    if (!account) throw new NotFoundError('Account');

    const [grants, ledger, reservations] = await Promise.all([
      rawPrisma.tokenGrant.findMany({
        where: { accountIdentityId: id },
        orderBy: { createdAt: 'desc' },
        include: {
          project: { select: { id: true, name: true } },
          donation: { select: { donationCode: true, status: true, amount: true } },
        },
      }),
      rawPrisma.tokenLedgerEntry.findMany({
        where: { accountIdentityId: id },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: {
          project: { select: { name: true } },
          actor: { select: { name: true } },
        },
      }),
      rawPrisma.reservation.findMany({
        where: { accountIdentityId: id },
        orderBy: { createdAt: 'desc' },
        include: {
          game: { select: { name: true, slug: true, status: true } },
          tile: { select: { boardNumber: true } },
        },
      }),
    ]);

    const spendable = grants
      .filter((g) => g.tokensRemaining > 0 && (!g.expiresAt || g.expiresAt > new Date()))
      .reduce((s, g) => s + g.tokensRemaining, 0);

    ok(res, {
      account,
      spendableTokens: spendable,
      // Ledger sum is the independent check on the mutable balance; a mismatch
      // means something wrote a balance without recording history.
      ledgerSum: ledger.reduce((s, e) => s + e.delta, 0),
      grants,
      ledger,
      reservations,
    });
  }),
);

router.get(
  '/ledger',
  authorize(PERMISSIONS.TOKENS_VIEW),
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const where: any = {};
    if (query.filters.reason) where.reason = query.filters.reason;
    if (query.filters.projectId) where.projectId = Number(query.filters.projectId);
    if (query.filters.accountIdentityId) {
      where.accountIdentityId = Number(query.filters.accountIdentityId);
    }
    if (query.search) {
      where.accountIdentity = {
        normalizedName: { contains: normalizeAccountName(query.search) },
      };
    }

    const [items, total] = await Promise.all([
      rawPrisma.tokenLedgerEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
        include: {
          accountIdentity: { select: { id: true, displayName: true } },
          project: { select: { name: true } },
          actor: { select: { name: true } },
        },
      }),
      rawPrisma.tokenLedgerEntry.count({ where }),
    ]);

    ok(res, items, undefined, paginationMeta(query.page, query.limit, total));
  }),
);

/**
 * Manual correction. Adds a standalone grant (positive) or burns spendable tokens
 * (negative), always with a reason and an actor recorded in the ledger.
 */
router.post(
  '/accounts/:id(\\d+)/adjust',
  authorize(PERMISSIONS.TOKENS_ADJUST),
  validate({
    body: z.object({
      projectId: z.number().int().positive(),
      delta: z.number().int().refine((n) => n !== 0, 'ต้องไม่เป็นศูนย์'),
      reason: z.string().min(3).max(255),
    }),
  }),
  asyncHandler(async (req, res) => {
    const accountIdentityId = Number(req.params.id);
    const { projectId, delta, reason } = req.body;
    const actorId = req.auth ? Number(req.auth.sub) : null;

    const result = await rawPrisma.$transaction(async (tx) => {
      const account = await tx.accountIdentity.findUnique({ where: { id: accountIdentityId } });
      if (!account) throw new NotFoundError('Account');
      const project = await tx.donationProject.findUnique({ where: { id: projectId } });
      if (!project) throw new NotFoundError('Donation project');

      if (delta > 0) {
        // A manual credit has no donation behind it, so it cannot reuse TokenGrant's
        // donation-keyed uniqueness — record it as ledger-only plus a synthetic grant
        // holding the balance.
        // Synthetic donation so the grant satisfies its FK while staying traceable.
        // CANCELLED keeps it out of every donation report and out of project totals.
        const placeholder = await tx.donation.create({
          data: {
            donationCode: `ADJ-${Date.now().toString(36).toUpperCase()}`,
            projectId,
            accountIdentityId,
            accountName: account.displayName,
            amount: 0,
            transferDate: new Date(),
            transferTime: '00:00',
            slipUrl: '',
            status: DonationStatus.CANCELLED,
            remark: `ปรับ token โดยผู้ดูแลระบบ: ${reason}`,
          },
        });
        const grant = await tx.tokenGrant.create({
          data: {
            accountIdentityId,
            projectId,
            donationId: placeholder.id,
            tokensGranted: delta,
            tokensRemaining: delta,
            tokenValueAtGrant: 0,
            donationAmount: 0,
            remainderAmount: 0,
          },
        });
        await tx.tokenLedgerEntry.create({
          data: { accountIdentityId, projectId, grantId: grant.id, delta, reason: 'ADJUST', description: reason, actorId },
        });
        return { delta };
      }

      // Negative: burn from spendable grants, newest first, never below zero.
      let toBurn = -delta;
      const grants = await tx.tokenGrant.findMany({
        where: { accountIdentityId, projectId, ...spendableWhere() },
        orderBy: { createdAt: 'desc' },
      });
      const available = grants.reduce((s, g) => s + g.tokensRemaining, 0);
      if (available < toBurn) {
        throw new BadRequestError(`Token คงเหลือไม่พอ (มี ${available} ต้องการหัก ${toBurn})`);
      }

      for (const g of grants) {
        if (toBurn <= 0) break;
        const take = Math.min(toBurn, g.tokensRemaining);
        await tx.tokenGrant.update({
          where: { id: g.id },
          data: { tokensRemaining: { decrement: take } },
        });
        await tx.tokenLedgerEntry.create({
          data: { accountIdentityId, projectId, grantId: g.id, delta: -take, reason: 'ADJUST', description: reason, actorId },
        });
        toBurn -= take;
      }
      return { delta };
    });

    ok(res, result, `ปรับ token ${delta > 0 ? '+' : ''}${delta} เรียบร้อย`);
  }),
);

/**
 * Rehearsal cleanup for one account: its grants, its ledger and the tiles it booked all go.
 *
 * Donations are deliberately left alone — they belong to a project, and wiping them is the
 * project's own "clear data" action. The account row itself only disappears when nothing else
 * points at it; deleting it while a donation still refers to it would either break the foreign
 * key or orphan a real donation from the person who made it.
 */
router.post(
  '/accounts/:id(\\d+)/clear',
  authorize(PERMISSIONS.TOKENS_ADJUST),
  asyncHandler(async (req, res) => {
    const accountIdentityId = Number(req.params.id);

    const result = await rawPrisma.$transaction(async (tx) => {
      const account = await tx.accountIdentity.findUnique({
        where: { id: accountIdentityId },
        include: { _count: { select: { donations: true } } },
      });
      if (!account) throw new NotFoundError('Account');

      // Ledger first: its rows point at both the grants and the reservations below.
      const ledgerEntries = await tx.tokenLedgerEntry.deleteMany({ where: { accountIdentityId } });
      const reservations = await tx.reservation.deleteMany({ where: { accountIdentityId } });
      const grants = await tx.tokenGrant.deleteMany({ where: { accountIdentityId } });

      const accountRemoved = account._count.donations === 0;
      if (accountRemoved) await tx.accountIdentity.delete({ where: { id: accountIdentityId } });

      return {
        displayName: account.displayName,
        ledgerEntries: ledgerEntries.count,
        reservations: reservations.count,
        grants: grants.count,
        accountRemoved,
      };
    });

    logger.warn({ accountIdentityId, ...result }, 'Token data cleared for an account');
    ok(
      res,
      result,
      `ล้าง token ของ "${result.displayName}" แล้ว: ${result.grants} grant, ${result.reservations} การจองป้าย` +
        (result.accountRemoved ? ' และลบบัญชีออกจากรายการ' : ' (ยังมีรายการบริจาคอยู่ จึงคงบัญชีไว้)'),
    );
  }),
);

export const tokensModule: FeatureModule = { name: 'tokens', basePath: '/tokens', router };
