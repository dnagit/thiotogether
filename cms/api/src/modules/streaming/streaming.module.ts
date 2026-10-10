import { z } from 'zod';
import { Router } from 'express';
import { prisma } from '../../core/database/prisma.js';
import { BaseRepository } from '../../core/base/BaseRepository.js';
import { BaseService } from '../../core/base/BaseService.js';
import { BaseController, ok, created } from '../../core/base/BaseController.js';
import { crudRouter } from '../../core/base/crudRouter.js';
import { authenticate } from '../../core/middleware/authenticate.js';
import { authorize } from '../../core/middleware/authorize.js';
import { audit } from '../../core/middleware/audit.js';
import { validate } from '../../core/middleware/validate.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { BadRequestError, NotFoundError } from '../../core/errors/AppError.js';
import { PERMISSIONS } from '@cms/shared';
import { xAccountSchema } from '../tracking/tracking.module.js';
import {
  assertPickRoom,
  computeAwards,
  drawPrize,
  drawWinner,
  listWinners,
  pickInclude,
} from './streamAwards.js';
import type { FeatureModule } from '../../core/modules.js';

/**
 * Streaming awards: rounds, the fans' proof of streams, and DJ's Pick.
 *
 *   /streaming/sessions                  → standard CRUD over the rounds
 *   GET  /streaming/sessions/:id/awards  → the round's awards, as the website will show them
 *   GET  /streaming/sessions/:id/winners → every winner, and what they have drawn
 *   POST /streaming/sessions/:id/draws   → { xAccount }: draw a winner's prize for them (on air, say)
 *   DELETE /streaming/draws/:id          → undo a draw; the prize goes back in the pool
 *   /streaming/proofs?sessionId=&status= → the fans' screenshots; approve by setting `streams`
 *   /streaming/prizes?sessionId=         → what winners can draw
 *   /streaming/picks?sessionId=          → the DJ's Pick winners; POST adds one by name
 *   POST /streaming/picks/draw           → the DJ draws a winner at random
 *   GET  /streaming/djs                  → the DJs to credit a pick to
 *
 * The public side — the ranking block — reads `/public/streaming`. See streamAwards.ts for
 * how the awards are worked out.
 */

const permissions = {
  view: PERMISSIONS.STREAMING_VIEW,
  create: PERMISSIONS.STREAMING_MANAGE,
  update: PERMISSIONS.STREAMING_MANAGE,
  delete: PERMISSIONS.STREAMING_MANAGE,
};

async function assertSession(sessionId: number): Promise<void> {
  const session = await prisma.streamSession.findFirst({ where: { id: sessionId } });
  if (!session) throw new NotFoundError('Streaming session');
}

// ── Sessions ──────────────────────────────────────────────────────────────────

const sessionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(1000).nullish(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  isOpen: z.boolean().default(true),
  isActive: z.boolean().default(true),
  starCount: z.number().int().min(1).max(50).default(3),
  risingCount: z.number().int().min(1).max(50).default(1),
  pickCount: z.number().int().min(1).max(50).default(3),
  starMedal: z.string().max(500).nullish(),
  risingMedal: z.string().max(500).nullish(),
  pickMedal: z.string().max(500).nullish(),
  starRankMedals: z.array(z.string().max(500)).max(50).optional(),
  risingRankMedals: z.array(z.string().max(500)).max(50).optional(),
});

class StreamSessionRepository extends BaseRepository<any> {
  protected modelName = 'streamSession';
  protected searchFields = ['name'];
  protected filterableFields = ['isActive', 'isOpen'];
  protected sortableFields = ['id', 'name', 'startsAt', 'createdAt'];
  protected defaultOrderBy: Record<string, 'asc' | 'desc'> = { startsAt: 'desc' };
  // The soft-delete extension filters top-level queries only, so the count says so itself.
  protected defaultInclude = {
    _count: { select: { proofs: { where: { deletedAt: null, status: 'PENDING' } } } },
  };
}

class StreamSessionService extends BaseService<any> {
  protected repository = new StreamSessionRepository();
  protected resourceName = 'Streaming session';

  protected async beforeCreate(data: any): Promise<any> {
    if (data.endsAt <= data.startsAt) throw new BadRequestError('วันจบต้องอยู่หลังวันเริ่ม');
    return data;
  }

  protected async beforeUpdate(id: number, data: any): Promise<any> {
    if (data.startsAt || data.endsAt) {
      const current = await prisma.streamSession.findFirst({ where: { id } });
      const startsAt = data.startsAt ?? current!.startsAt;
      const endsAt = data.endsAt ?? current!.endsAt;
      if (endsAt <= startsAt) throw new BadRequestError('วันจบต้องอยู่หลังวันเริ่ม');
    }
    return data;
  }
}

class StreamSessionController extends BaseController<any> {
  protected service = new StreamSessionService();
}

const sessionRouter: Router = crudRouter({
  controller: new StreamSessionController(),
  resource: 'stream-sessions',
  permissions,
  createSchema: sessionSchema,
  updateSchema: sessionSchema.partial(),
});

sessionRouter.get(
  '/:id(\\d+)/awards',
  authorize(PERMISSIONS.STREAMING_VIEW),
  asyncHandler(async (req, res) => {
    ok(res, await computeAwards(Number(req.params.id)));
  }),
);

sessionRouter.get(
  '/:id(\\d+)/winners',
  authorize(PERMISSIONS.STREAMING_VIEW),
  asyncHandler(async (req, res) => {
    ok(res, await listWinners(Number(req.params.id)));
  }),
);

const adminDrawSchema = z.object({ xAccount: xAccountSchema });

sessionRouter.post(
  '/:id(\\d+)/draws',
  authorize(PERMISSIONS.STREAMING_MANAGE),
  validate({ body: adminDrawSchema }),
  asyncHandler(async (req, res) => {
    const { xAccount } = req.body as z.infer<typeof adminDrawSchema>;
    const { draw } = await drawPrize(Number(req.params.id), xAccount);
    ok(res, draw, `@${draw.xAccount} ได้ ${draw.prize.name}`);
  }),
);

// ── Proofs ────────────────────────────────────────────────────────────────────

const streamsSchema = z.number().int().min(0).max(10_000_000);

/** A row the admin types in by hand: no screenshot, and counted straight away. */
const proofCreateSchema = z.object({
  sessionId: z.number().int().positive(),
  xAccount: xAccountSchema,
  streams: streamsSchema,
  note: z.string().max(300).nullish(),
});

const proofUpdateSchema = z.object({
  xAccount: xAccountSchema.optional(),
  streams: streamsSchema.nullish(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  reviewNote: z.string().max(300).nullish(),
});

class StreamProofRepository extends BaseRepository<any> {
  protected modelName = 'streamProof';
  protected searchFields = ['xAccount'];
  protected filterableFields = ['sessionId', 'status'];
  protected sortableFields = ['id', 'xAccount', 'streams', 'status', 'createdAt'];
  protected defaultOrderBy: Record<string, 'asc' | 'desc'> = { createdAt: 'desc' };
}

class StreamProofService extends BaseService<any> {
  protected repository = new StreamProofRepository();
  protected resourceName = 'Stream proof';

  protected async beforeCreate(data: any): Promise<any> {
    await assertSession(data.sessionId);
    return { ...data, status: 'APPROVED' };
  }

  /** An approved proof without a number would count as nothing, silently. */
  protected async beforeUpdate(id: number, data: any): Promise<any> {
    const current = await prisma.streamProof.findFirst({ where: { id } });
    const status = data.status ?? current!.status;
    const streams = data.streams !== undefined ? data.streams : current!.streams;
    if (status === 'APPROVED' && streams === null) {
      throw new BadRequestError('กรอกยอดสตรีมก่อนอนุมัติ');
    }
    return data;
  }
}

class StreamProofController extends BaseController<any> {
  protected service = new StreamProofService();
}

const proofRouter: Router = crudRouter({
  controller: new StreamProofController(),
  resource: 'stream-proofs',
  permissions,
  createSchema: proofCreateSchema,
  updateSchema: proofUpdateSchema,
});

// ── Prizes ────────────────────────────────────────────────────────────────────

const prizeSchema = z.object({
  sessionId: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  image: z.string().max(500).nullish(),
  quantity: z.number().int().min(0).max(10_000).default(1),
  sortOrder: z.number().int().default(0),
});

class StreamPrizeRepository extends BaseRepository<any> {
  protected modelName = 'streamPrize';
  protected searchFields = ['name'];
  protected filterableFields = ['sessionId'];
  protected sortableFields = ['id', 'name', 'sortOrder', 'createdAt'];
  protected defaultOrderBy: Record<string, 'asc' | 'desc'> = { sortOrder: 'asc' };
  /** How many have been drawn. */
  protected defaultInclude = {
    _count: { select: { draws: { where: { deletedAt: null } } } },
  };
}

class StreamPrizeService extends BaseService<any> {
  protected repository = new StreamPrizeRepository();
  protected resourceName = 'Prize';

  protected async beforeCreate(data: any): Promise<any> {
    await assertSession(data.sessionId);
    return data;
  }
}

class StreamPrizeController extends BaseController<any> {
  protected service = new StreamPrizeService();
}

const prizeRouter: Router = crudRouter({
  controller: new StreamPrizeController(),
  resource: 'stream-prizes',
  permissions,
  createSchema: prizeSchema,
  // A prize stays in its round.
  updateSchema: prizeSchema.omit({ sessionId: true }).partial(),
});

// ── Picks ─────────────────────────────────────────────────────────────────────

const djIdSchema = z.number().int().positive().nullish();

/** The DJ may also just name the winner rather than draw one. */
const pickCreateSchema = z.object({
  sessionId: z.number().int().positive(),
  djId: djIdSchema,
  xAccount: xAccountSchema,
});

class StreamPickRepository extends BaseRepository<any> {
  protected modelName = 'streamPick';
  protected searchFields = ['xAccount'];
  protected filterableFields = ['sessionId'];
  protected sortableFields = ['id', 'xAccount', 'createdAt'];
  protected defaultOrderBy: Record<string, 'asc' | 'desc'> = { id: 'desc' };
  protected defaultInclude = pickInclude;
}

class StreamPickService extends BaseService<any> {
  protected repository = new StreamPickRepository();
  protected resourceName = "DJ's Pick";

  protected async beforeCreate(data: any): Promise<any> {
    const session = await prisma.streamSession.findFirst({ where: { id: data.sessionId } });
    if (!session) throw new NotFoundError('Streaming session');
    await assertPickRoom(session);
    return { ...data, djId: data.djId ?? null };
  }
}

class StreamPickController extends BaseController<any> {
  protected service = new StreamPickService();
}

const pickRouter: Router = crudRouter({
  controller: new StreamPickController(),
  resource: 'stream-picks',
  permissions,
  createSchema: pickCreateSchema,
  // The winner is what was drawn; only the DJ credited can change.
  updateSchema: z.object({ djId: djIdSchema }),
});

const drawSchema = z.object({ sessionId: z.number().int().positive(), djId: djIdSchema });

// `crudRouter` has already put authentication and the audit log in front of these.
pickRouter.post(
  '/draw',
  authorize(PERMISSIONS.STREAMING_MANAGE),
  validate({ body: drawSchema }),
  asyncHandler(async (req, res) => {
    const { sessionId, djId } = req.body as z.infer<typeof drawSchema>;
    const pick = await drawWinner(sessionId, djId ?? null);
    created(res, pick, `ผู้โชคดีคือ @${pick.xAccount}`);
  }),
);

// ── Draws ─────────────────────────────────────────────────────────────────────

/** Undoing a draw only: draws are made by `drawPrize`, never typed in. */
const drawRouter = Router();
drawRouter.use(authenticate, audit('stream-draws'));
drawRouter.delete(
  '/:id(\\d+)',
  authorize(PERMISSIONS.STREAMING_MANAGE),
  asyncHandler(async (req, res) => {
    const draw = await prisma.streamDraw.findFirst({ where: { id: Number(req.params.id) } });
    if (!draw) throw new NotFoundError('Draw');
    await prisma.streamDraw.delete({ where: { id: draw.id } });
    ok(res, null, 'ยกเลิกแล้ว ของรางวัลกลับเข้ากอง');
  }),
);

// ── DJs ───────────────────────────────────────────────────────────────────────

/** Names and pictures only, so crediting a pick needs no access to the DJ schedule. */
const djRouter = Router();
djRouter.get(
  '/',
  authenticate,
  authorize(PERMISSIONS.STREAMING_VIEW),
  asyncHandler(async (_req, res) => {
    const djs = await prisma.dj.findMany({
      where: { isActive: true },
      select: { id: true, name: true, image: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    ok(res, djs);
  }),
);

const router = Router();
router.use('/sessions', sessionRouter);
router.use('/proofs', proofRouter);
router.use('/prizes', prizeRouter);
router.use('/picks', pickRouter);
router.use('/draws', drawRouter);
router.use('/djs', djRouter);

export const streamingModule: FeatureModule = {
  name: 'streaming',
  basePath: '/streaming',
  router,
};
