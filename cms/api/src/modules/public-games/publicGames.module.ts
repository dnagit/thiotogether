import { z } from 'zod';
import { Router } from 'express';
import { rawPrisma } from '../../core/database/prisma.js';
import { validate } from '../../core/middleware/validate.js';
import { accountLookupLimiter, reserveLimiter } from '../../core/middleware/rateLimit.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { ok } from '../../core/base/BaseController.js';
import { getPublicBoard, reserveTile } from '../../core/game/gameService.js';
import { findAccountIdentity } from '../../core/tokens/tokenService.js';
import { assertValidAccountName } from '../../core/tokens/accountName.js';
import type { FeatureModule } from '../../core/modules.js';

/**
 * Unauthenticated player-facing endpoints. Nothing here may return reward text for
 * an unrevealed game — `getPublicBoard` is the only board serializer used.
 */

const router = Router();

/** Admin-configurable account-name rule, read from settings on each request. */
async function accountNamePattern(): Promise<string | null> {
  const setting = await rawPrisma.setting.findUnique({ where: { key: 'account_name_pattern' } });
  const value = setting?.value as unknown;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

router.get(
  '/games',
  asyncHandler(async (_req, res) => {
    const games = await rawPrisma.game.findMany({
      where: { deletedAt: null, status: { in: ['OPEN', 'FULL', 'REVEALED'] } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      select: {
        name: true,
        slug: true,
        description: true,
        coverImage: true,
        status: true,
        tileCount: true,
        tokensPerTile: true,
        themeColor: true,
        opensAt: true,
        closesAt: true,
        revealedAt: true,
        _count: { select: { reservations: true } },
      },
    });

    ok(
      res,
      games.map(({ _count, ...g }) => ({ ...g, reservedCount: _count.reservations })),
    );
  }),
);

router.get(
  '/games/:slug',
  asyncHandler(async (req, res) => ok(res, await getPublicBoard(req.params.slug))),
);

/**
 * Token balance for a typed account name, scoped to one game's accepted projects.
 * Rate limited: the response is exactly the information a name-guesser wants.
 */
router.post(
  '/games/:slug/check-account',
  accountLookupLimiter,
  validate({ body: z.object({ accountName: z.string().min(1).max(190) }) }),
  asyncHandler(async (req, res) => {
    const game = await rawPrisma.game.findFirst({
      where: { slug: req.params.slug, deletedAt: null, status: { not: 'DRAFT' } },
      include: { projects: { include: { project: { select: { id: true, name: true, slug: true } } } } },
    });
    if (!game) {
      ok(res, { found: false, tokens: 0, projects: [], maxTilesPerAccount: null, reservedByMe: [] });
      return;
    }

    const displayName = assertValidAccountName(req.body.accountName, await accountNamePattern());
    const identity = await findAccountIdentity(displayName);

    if (!identity) {
      ok(res, {
        found: false,
        displayName,
        tokens: 0,
        projects: game.projects.map((p) => p.project),
        maxTilesPerAccount: game.maxTilesPerAccount,
        reservedByMe: [],
      });
      return;
    }

    const projectIds = game.projects.map((p) => p.projectId);
    const [agg, mine] = await Promise.all([
      rawPrisma.tokenGrant.aggregate({
        where: {
          accountIdentityId: identity.id,
          projectId: { in: projectIds },
          tokensRemaining: { gt: 0 },
          deletedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        _sum: { tokensRemaining: true },
      }),
      rawPrisma.reservation.findMany({
        where: { gameId: game.id, accountIdentityId: identity.id },
        select: { tile: { select: { boardNumber: true } } },
      }),
    ]);

    ok(res, {
      found: true,
      displayName: identity.displayName,
      tokens: agg._sum.tokensRemaining ?? 0,
      tokensPerTile: game.tokensPerTile,
      projects: game.projects.map((p) => p.project),
      maxTilesPerAccount: game.maxTilesPerAccount,
      reservedByMe: mine.map((r) => r.tile.boardNumber).sort((a, b) => a - b),
    });
  }),
);

router.post(
  '/games/:slug/reserve',
  reserveLimiter,
  validate({
    body: z.object({
      accountName: z.string().min(1).max(190),
      boardNumber: z.coerce.number().int().positive(),
      /** Client-generated; makes a retried or double-clicked request harmless. */
      idempotencyKey: z.string().min(8).max(64),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await reserveTile(
      {
        gameSlug: req.params.slug,
        boardNumber: req.body.boardNumber,
        accountName: req.body.accountName,
        idempotencyKey: req.body.idempotencyKey,
      },
      await accountNamePattern(),
    );

    ok(
      res,
      result,
      result.remainingTokens > 0
        ? `จองป้ายสำเร็จ คุณยังสามารถเปิดได้อีก ${Math.floor(result.remainingTokens / result.tokensSpent)} ป้าย`
        : 'ขอบคุณที่ร่วมสนุก คุณสามารถเปิดป้ายเพิ่มได้โดยไปที่หน้า Donate',
    );
  }),
);

/** Token summary across every project, for the standalone "check my tokens" page. */
router.post(
  '/tokens/check',
  accountLookupLimiter,
  validate({ body: z.object({ accountName: z.string().min(1).max(190) }) }),
  asyncHandler(async (req, res) => {
    const displayName = assertValidAccountName(req.body.accountName, await accountNamePattern());
    const identity = await findAccountIdentity(displayName);
    if (!identity) {
      ok(res, { found: false, displayName, total: 0, byProject: [], pendingDonations: 0 });
      return;
    }

    const [grants, pending] = await Promise.all([
      rawPrisma.tokenGrant.findMany({
        where: {
          accountIdentityId: identity.id,
          tokensRemaining: { gt: 0 },
          deletedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        include: { project: { select: { id: true, name: true, slug: true } } },
      }),
      rawPrisma.donation.count({
        where: {
          accountIdentityId: identity.id,
          status: { in: ['PENDING', 'NEEDS_REVIEW', 'AUTO_VERIFIED'] },
          deletedAt: null,
        },
      }),
    ]);

    const byProject = new Map<number, { projectId: number; name: string; slug: string; tokens: number }>();
    for (const g of grants) {
      const row = byProject.get(g.projectId) ?? {
        projectId: g.projectId,
        name: g.project.name,
        slug: g.project.slug,
        tokens: 0,
      };
      row.tokens += g.tokensRemaining;
      byProject.set(g.projectId, row);
    }

    ok(res, {
      found: true,
      displayName: identity.displayName,
      total: grants.reduce((s, g) => s + g.tokensRemaining, 0),
      byProject: [...byProject.values()],
      pendingDonations: pending,
    });
  }),
);

export const publicGamesModule: FeatureModule = {
  name: 'public-games',
  basePath: '/public',
  router,
};
