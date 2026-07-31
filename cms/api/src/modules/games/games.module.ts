import { z } from 'zod';
import { Router } from 'express';
import { prisma, rawPrisma } from '../../core/database/prisma.js';
import { authenticate } from '../../core/middleware/authenticate.js';
import { authorize } from '../../core/middleware/authorize.js';
import { validate } from '../../core/middleware/validate.js';
import { audit } from '../../core/middleware/audit.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { ok, created } from '../../core/base/BaseController.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../core/errors/AppError.js';
import { parseListQuery } from '../../core/utils/pagination.js';
import { blank, blankToUndefined } from '../../core/utils/zod.js';
import { openGame, revealGame, shuffleGame } from '../../core/game/gameService.js';
import { PERMISSIONS, slugify } from '@cms/shared';
import type { FeatureModule } from '../../core/modules.js';

// ── Validation ──────────────────────────────────────────────

const gameSchema = z.object({
  name: z.string().min(1).max(200),
  slug: blankToUndefined(z.string().min(1).max(200).regex(/^[a-z0-9ก-๙-]+$/).optional()),
  description: blank(z.string().nullish()),
  coverImage: blank(z.string().max(500).nullish()),
  tileCount: z.coerce.number().int().min(1).max(1000),
  tileFrontImage: blank(z.string().max(500).nullish()),
  tokensPerTile: z.coerce.number().int().min(1).max(100).default(1),
  showReserverNames: z.boolean().default(true),
  maxTilesPerAccount: z.coerce.number().int().min(1).nullish(),
  themeColor: blank(z.string().max(20).nullish()),
  opensAt: blank(z.coerce.date().nullish()),
  closesAt: blank(z.coerce.date().nullish()),
  projectIds: z.array(z.number().int().positive()).default([]),
});

const rewardsSchema = z.object({
  /** Full replacement list — simpler to reason about than per-row diffing. */
  rewards: z
    .array(
      z.object({
        label: z.string().min(1).max(500),
        imageUrl: blank(z.string().max(500).nullish()),
        /** Consolation lines stay false, so only real prizes reach the public winners list. */
        isPrize: z.boolean().default(false),
      }),
    )
    .max(1000),
});

/**
 * Per-tile cover art, addressed by board number.
 *
 * Deliberately keyed to the tile and not to the reward: rewards are shuffled onto
 * tiles, so attaching cover art to a reward would put a visible clue about which
 * prize sits where on the face-down side of the board.
 */
const tileImagesSchema = z.object({
  tiles: z
    .array(
      z.object({
        boardNumber: z.number().int().positive(),
        frontImage: blank(z.string().max(500).nullish()),
      }),
    )
    .max(1000),
});

const bulkTextSchema = z.object({
  /** One reward per line; blank lines ignored. Powers both paste and CSV import. */
  text: z.string().min(1).max(200_000),
  replace: z.boolean().default(false),
});

// ── Helpers ─────────────────────────────────────────────────

const adminGameInclude = {
  projects: { include: { project: { select: { id: true, name: true, slug: true, tokenValue: true } } } },
  rewards: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
  _count: { select: { reservations: true, rewards: true } },
} as const;

async function assertEditable(gameId: number): Promise<void> {
  const game = await rawPrisma.game.findUnique({
    where: { id: gameId },
    include: { _count: { select: { reservations: true } } },
  });
  if (!game) throw new NotFoundError('Game');
  if (game.status === 'REVEALED') throw new ConflictError('เกมนี้เฉลยผลแล้ว แก้ไขไม่ได้');
  if (game._count.reservations > 0) {
    throw new ConflictError('เกมนี้มีผู้จองแล้ว แก้ไขรางวัลหรือจำนวนป้ายไม่ได้');
  }
}

/** Recreate tiles 1..n, preserving nothing — only valid before any reservation. */
async function syncTiles(gameId: number, tileCount: number): Promise<void> {
  const existing = await rawPrisma.boardTile.findMany({
    where: { gameId },
    orderBy: { boardNumber: 'asc' },
  });
  if (existing.length === tileCount) return;

  await rawPrisma.boardTile.deleteMany({ where: { gameId } });
  await rawPrisma.boardTile.createMany({
    data: Array.from({ length: tileCount }, (_, i) => ({ gameId, boardNumber: i + 1 })),
  });
  // Tile set changed, so any previous shuffle is void.
  await rawPrisma.game.update({
    where: { id: gameId },
    data: { shuffledAt: null, commitmentHash: null },
  });
}

/**
 * Anything that detaches rewards from tiles (editing the reward list, changing the
 * tile count) leaves a live game with an unassigned board. Re-shuffle immediately so
 * an OPEN game is never playable without prizes behind it.
 *
 * Safe because both operations already refuse once a reservation exists, so there is
 * no outcome to rewrite.
 */
async function reshuffleIfLive(gameId: number): Promise<void> {
  const game = await rawPrisma.game.findUnique({
    where: { id: gameId },
    include: { _count: { select: { rewards: true, reservations: true } } },
  });
  if (!game || game.status === 'DRAFT' || game.status === 'REVEALED') return;
  if (game._count.reservations > 0) return;
  if (game._count.rewards !== game.tileCount) return; // Cannot shuffle an incomplete set.

  await shuffleGame(gameId);
}

async function setProjects(gameId: number, projectIds: number[]): Promise<void> {
  await rawPrisma.gameDonationProject.deleteMany({ where: { gameId } });
  if (projectIds.length > 0) {
    await rawPrisma.gameDonationProject.createMany({
      data: projectIds.map((projectId) => ({ gameId, projectId })),
      skipDuplicates: true,
    });
  }
}

// ── Routes ──────────────────────────────────────────────────

const router = Router();
router.use(authenticate, audit('games'));

router.get(
  '/',
  authorize(PERMISSIONS.GAMES_VIEW),
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const where: any = {};
    if (query.filters.status) where.status = query.filters.status;
    if (query.search) where.name = { contains: query.search, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      prisma.game.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
        include: adminGameInclude,
      }),
      prisma.game.count({ where }),
    ]);
    ok(res, items, undefined, {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    });
  }),
);

router.get(
  '/:id(\\d+)',
  authorize(PERMISSIONS.GAMES_VIEW),
  asyncHandler(async (req, res) => {
    const game = await prisma.game.findFirst({
      where: { id: Number(req.params.id) },
      include: adminGameInclude,
    });
    if (!game) throw new NotFoundError('Game');
    ok(res, game);
  }),
);

/**
 * Admin board view. Unlike the public board this DOES include reward assignments —
 * it is gated behind GAMES_MANAGE so an organiser can preview the outcome.
 */
router.get(
  '/:id(\\d+)/board',
  authorize(PERMISSIONS.GAMES_MANAGE),
  asyncHandler(async (req, res) => {
    const tiles = await prisma.boardTile.findMany({
      where: { gameId: Number(req.params.id) },
      orderBy: { boardNumber: 'asc' },
      include: {
        reward: { select: { id: true, label: true, imageUrl: true } },
        reservation: { select: { accountNameSnapshot: true, createdAt: true, tokensSpent: true } },
      },
    });
    ok(res, tiles);
  }),
);

router.post(
  '/',
  authorize(PERMISSIONS.GAMES_MANAGE),
  validate({ body: gameSchema }),
  asyncHandler(async (req, res) => {
    const { projectIds, ...data } = req.body;
    const slug = data.slug || slugify(data.name);
    if (await rawPrisma.game.findFirst({ where: { slug } })) {
      throw new ConflictError(`Slug "${slug}" ถูกใช้แล้ว`);
    }

    const game = await rawPrisma.game.create({ data: { ...data, slug } });
    await syncTiles(game.id, game.tileCount);
    await setProjects(game.id, projectIds);

    created(res, await prisma.game.findFirst({ where: { id: game.id }, include: adminGameInclude }));
  }),
);

router.put(
  '/:id(\\d+)',
  authorize(PERMISSIONS.GAMES_MANAGE),
  validate({ body: gameSchema.partial() }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { projectIds, ...data } = req.body;

    const current = await rawPrisma.game.findUnique({
      where: { id },
      include: { _count: { select: { reservations: true } } },
    });
    if (!current) throw new NotFoundError('Game');
    if (current.status === 'REVEALED') throw new ConflictError('เกมนี้เฉลยผลแล้ว แก้ไขไม่ได้');

    // Tile count is structural: changing it after play would orphan reservations.
    if (data.tileCount !== undefined && data.tileCount !== current.tileCount) {
      if (current._count.reservations > 0) {
        throw new ConflictError('เกมนี้มีผู้จองแล้ว เปลี่ยนจำนวนป้ายไม่ได้');
      }
    }
    if (data.slug && data.slug !== current.slug) {
      if (await rawPrisma.game.findFirst({ where: { slug: data.slug, id: { not: id } } })) {
        throw new ConflictError(`Slug "${data.slug}" ถูกใช้แล้ว`);
      }
    }

    await rawPrisma.game.update({ where: { id }, data });
    if (data.tileCount !== undefined) {
      await syncTiles(id, data.tileCount);
      await reshuffleIfLive(id);
    }
    if (projectIds !== undefined) await setProjects(id, projectIds);

    ok(res, await prisma.game.findFirst({ where: { id }, include: adminGameInclude }), 'Updated');
  }),
);

router.delete(
  '/:id(\\d+)',
  authorize(PERMISSIONS.GAMES_MANAGE),
  asyncHandler(async (req, res) => {
    await prisma.game.delete({ where: { id: Number(req.params.id) } });
    ok(res, null, 'Deleted');
  }),
);

// ── Rewards ─────────────────────────────────────────────────

router.put(
  '/:id(\\d+)/rewards',
  authorize(PERMISSIONS.GAMES_MANAGE),
  validate({ body: rewardsSchema }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await assertEditable(id);

    await rawPrisma.$transaction(async (tx) => {
      // Detach before delete: board_tiles.reward_id is FK-constrained.
      await tx.boardTile.updateMany({ where: { gameId: id }, data: { rewardId: null } });
      await tx.reward.deleteMany({ where: { gameId: id } });
      await tx.reward.createMany({
        data: req.body.rewards.map((r: any, i: number) => ({
          gameId: id,
          label: r.label,
          imageUrl: r.imageUrl ?? null,
          isPrize: r.isPrize ?? false,
          sortOrder: i,
        })),
      });
      await tx.game.update({ where: { id }, data: { shuffledAt: null, commitmentHash: null } });
    });
    await reshuffleIfLive(id);

    ok(res, await prisma.reward.findMany({ where: { gameId: id }, orderBy: { sortOrder: 'asc' } }), 'Saved');
  }),
);

/** Paste-many / CSV import: one reward per line, first CSV column wins. */
router.post(
  '/:id(\\d+)/rewards/bulk',
  authorize(PERMISSIONS.GAMES_MANAGE),
  validate({ body: bulkTextSchema }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await assertEditable(id);

    const labels = String(req.body.text)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      // Take the first CSV field, honouring simple quoting.
      .map((line) => (line.startsWith('"') ? (line.match(/^"([^"]*)"/)?.[1] ?? line) : line.split(',')[0].trim()))
      .filter(Boolean)
      .map((label) => label.slice(0, 500));

    if (labels.length === 0) throw new BadRequestError('ไม่พบข้อความรางวัลในข้อมูลที่วาง');

    const offset = req.body.replace ? 0 : await rawPrisma.reward.count({ where: { gameId: id } });

    await rawPrisma.$transaction(async (tx) => {
      if (req.body.replace) {
        await tx.boardTile.updateMany({ where: { gameId: id }, data: { rewardId: null } });
        await tx.reward.deleteMany({ where: { gameId: id } });
      }
      await tx.reward.createMany({
        data: labels.map((label, i) => ({ gameId: id, label, sortOrder: offset + i })),
      });
      await tx.game.update({ where: { id }, data: { shuffledAt: null, commitmentHash: null } });
    });
    await reshuffleIfLive(id);

    ok(res, { imported: labels.length }, `นำเข้า ${labels.length} รางวัล`);
  }),
);

/**
 * Set cover art per tile. Allowed while the game is live — the face-down artwork is
 * cosmetic and carries no information about the reward underneath, so changing it
 * cannot alter anyone's outcome. Only a revealed game is frozen.
 */
router.put(
  '/:id(\\d+)/tiles',
  authorize(PERMISSIONS.GAMES_MANAGE),
  validate({ body: tileImagesSchema }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const game = await rawPrisma.game.findUnique({ where: { id } });
    if (!game) throw new NotFoundError('Game');
    if (game.status === 'REVEALED') throw new ConflictError('เกมนี้เฉลยผลแล้ว แก้ไขไม่ได้');

    const existing = await rawPrisma.boardTile.findMany({
      where: { gameId: id },
      select: { boardNumber: true },
    });
    const valid = new Set(existing.map((t) => t.boardNumber));

    await rawPrisma.$transaction(
      req.body.tiles
        .filter((t: any) => valid.has(t.boardNumber))
        .map((t: any) =>
          rawPrisma.boardTile.update({
            where: { gameId_boardNumber: { gameId: id, boardNumber: t.boardNumber } },
            data: { frontImage: t.frontImage ?? null },
          }),
        ),
    );

    ok(
      res,
      await rawPrisma.boardTile.findMany({
        where: { gameId: id },
        orderBy: { boardNumber: 'asc' },
        select: { boardNumber: true, frontImage: true },
      }),
      'บันทึกรูปปกป้ายแล้ว',
    );
  }),
);

// ── Lifecycle ───────────────────────────────────────────────

router.post(
  '/:id(\\d+)/shuffle',
  authorize(PERMISSIONS.GAMES_MANAGE),
  asyncHandler(async (req, res) => {
    const hash = await shuffleGame(Number(req.params.id));
    ok(res, { commitmentHash: hash }, 'สุ่มรางวัลใหม่แล้ว');
  }),
);

router.post(
  '/:id(\\d+)/open',
  authorize(PERMISSIONS.GAMES_MANAGE),
  asyncHandler(async (req, res) => ok(res, await openGame(Number(req.params.id)), 'เปิดเกมแล้ว')),
);

router.post(
  '/:id(\\d+)/close',
  authorize(PERMISSIONS.GAMES_MANAGE),
  asyncHandler(async (req, res) => {
    const game = await rawPrisma.game.findUnique({ where: { id: Number(req.params.id) } });
    if (!game) throw new NotFoundError('Game');
    if (game.status === 'REVEALED') throw new ConflictError('เกมนี้เฉลยผลแล้ว');
    ok(res, await rawPrisma.game.update({ where: { id: game.id }, data: { status: 'DRAFT' } }), 'ปิดรับจองแล้ว');
  }),
);

router.post(
  '/:id(\\d+)/reveal',
  authorize(PERMISSIONS.GAMES_REVEAL),
  asyncHandler(async (req, res) => {
    const game = await revealGame(Number(req.params.id), req.auth ? Number(req.auth.sub) : null);
    ok(res, game, 'เฉลยผลเรียบร้อย');
  }),
);

router.post(
  '/:id(\\d+)/duplicate',
  authorize(PERMISSIONS.GAMES_MANAGE),
  asyncHandler(async (req, res) => {
    const src = await rawPrisma.game.findUnique({
      where: { id: Number(req.params.id) },
      include: { rewards: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } }, projects: true },
    });
    if (!src) throw new NotFoundError('Game');

    const copy = await rawPrisma.game.create({
      data: {
        name: `${src.name} (copy)`,
        slug: `${src.slug}-copy-${Date.now().toString(36)}`,
        description: src.description,
        coverImage: src.coverImage,
        tileCount: src.tileCount,
        tileFrontImage: src.tileFrontImage,
        tokensPerTile: src.tokensPerTile,
        showReserverNames: src.showReserverNames,
        maxTilesPerAccount: src.maxTilesPerAccount,
        themeColor: src.themeColor,
        // A copy always starts unplayed and unshuffled.
        status: 'DRAFT',
      },
    });
    await syncTiles(copy.id, copy.tileCount);
    await setProjects(copy.id, src.projects.map((p) => p.projectId));
    await rawPrisma.reward.createMany({
      data: src.rewards.map((r, i) => ({
        gameId: copy.id,
        label: r.label,
        imageUrl: r.imageUrl,
        isPrize: r.isPrize,
        sortOrder: i,
      })),
    });

    created(res, await prisma.game.findFirst({ where: { id: copy.id }, include: adminGameInclude }));
  }),
);

// ── Results ─────────────────────────────────────────────────

router.get(
  '/:id(\\d+)/results',
  authorize(PERMISSIONS.GAMES_VIEW),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const game = await rawPrisma.game.findUnique({ where: { id } });
    if (!game) throw new NotFoundError('Game');

    const tiles = await rawPrisma.boardTile.findMany({
      where: { gameId: id },
      orderBy: { boardNumber: 'asc' },
      include: {
        reward: { select: { label: true } },
        reservation: { select: { accountNameSnapshot: true, createdAt: true } },
      },
    });

    const rows = tiles.map((t) => ({
      boardNumber: t.boardNumber,
      reservedBy: t.reservation?.accountNameSnapshot ?? '',
      reservedAt: t.reservation?.createdAt?.toISOString() ?? '',
      // Withheld until reveal even for admins in the exportable view, so a leaked
      // CSV cannot spoil an in-flight game.
      reward: game.status === 'REVEALED' ? (t.reward?.label ?? '') : '(ยังไม่เฉลย)',
    }));

    if (req.query.format === 'csv') {
      const csv = [
        'board_number,reserved_by,reserved_at,reward',
        ...rows.map((r) =>
          [r.boardNumber, r.reservedBy, r.reservedAt, r.reward]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(','),
        ),
      ].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="game-${game.slug}-results.csv"`);
      // U+FEFF BOM so Excel opens Thai text correctly.
      res.send(`\uFEFF${csv}`);
      return;
    }

    ok(res, { game: { name: game.name, slug: game.slug, status: game.status }, rows });
  }),
);

export const gamesModule: FeatureModule = { name: 'games', basePath: '/games', router };
