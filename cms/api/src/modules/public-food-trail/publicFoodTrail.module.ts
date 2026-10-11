import { z } from 'zod';
import { Router } from 'express';
import { prisma } from '../../core/database/prisma.js';
import { validate } from '../../core/middleware/validate.js';
import { foodTrailLimiter } from '../../core/middleware/rateLimit.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { ok } from '../../core/base/BaseController.js';
import { NotFoundError } from '../../core/errors/AppError.js';
import type { FoodTrailProgress, PublicFoodTrail } from '@cms/shared';
import { placeOrder } from '../food-trail/foodTrail.module.js';
import { xAccountSchema } from '../tracking/tracking.module.js';
import type { FeatureModule } from '../../core/modules.js';

/**
 * The food trail for the website's checklist block.
 *
 *   GET /public/food-trail?trailId=                 → one trail's restaurants and dishes, names only
 *   GET /public/food-trail/progress?trailId=&account= → what that account has ticked
 *   PUT /public/food-trail/progress { trailId, account, placeIds, menuIds } → save its ticks
 *
 * Without `trailId`, the first trail shown on the web. Pictures are deliberately left out:
 * they are the admin's, for the poster.
 *
 * Ticks are kept under the account the fan types, so typing it again — on another phone, say —
 * brings them back. There is no password; see `FoodTrailProgress` in the schema.
 */

const querySchema = z.object({
  trailId: z.coerce.number().int().positive().optional(),
});

const router = Router();

router.get(
  '/food-trail',
  validate({ query: querySchema }),
  asyncHandler(async (req, res) => {
    const { trailId } = req.query as unknown as z.infer<typeof querySchema>;
    const trail = await prisma.foodTrail.findFirst({
      where: { isActive: true, ...(trailId ? { id: trailId } : {}) },
      orderBy: placeOrder,
      select: {
        id: true,
        name: true,
        description: true,
        places: {
          where: { deletedAt: null },
          orderBy: placeOrder,
          select: {
            id: true,
            name: true,
            note: true,
            menus: {
              where: { deletedAt: null },
              orderBy: placeOrder,
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    // Short: a restaurant the admin has just added should show within the minute.
    res.setHeader('Cache-Control', 'public, max-age=30');
    ok(res, trail satisfies PublicFoodTrail | null);
  }),
);

// ── A fan's ticks ───────────────────────────────────────────

/** Accounts are kept lower-cased, so "@Name" and "name" find the same ticks. */
const accountKey = xAccountSchema.transform((s) => s.toLowerCase());

const progressQuery = z.object({
  trailId: z.coerce.number().int().positive(),
  account: accountKey,
});

const progressBody = z.object({
  trailId: z.number().int().positive(),
  account: accountKey,
  placeIds: z.array(z.number().int().positive()).max(2000),
  menuIds: z.array(z.number().int().positive()).max(5000),
});

const empty = (account: string): FoodTrailProgress => ({ account, placeIds: [], menuIds: [], updatedAt: null });

router.get(
  '/food-trail/progress',
  foodTrailLimiter,
  validate({ query: progressQuery }),
  asyncHandler(async (req, res) => {
    const { trailId, account } = req.query as unknown as z.infer<typeof progressQuery>;
    const row = await prisma.foodTrailProgress.findUnique({
      where: { trailId_account: { trailId, account } },
    });
    res.setHeader('Cache-Control', 'no-store');
    ok(
      res,
      row
        ? { account, placeIds: row.placeIds, menuIds: row.menuIds, updatedAt: row.updatedAt.toISOString() }
        : empty(account),
    );
  }),
);

router.put(
  '/food-trail/progress',
  foodTrailLimiter,
  validate({ body: progressBody }),
  asyncHandler(async (req, res) => {
    const { trailId, account, placeIds, menuIds } = req.body as z.infer<typeof progressBody>;
    // Only ids that are on this trail now: a stale page cannot write anything else.
    const trail = await prisma.foodTrail.findFirst({
      where: { id: trailId, isActive: true },
      select: {
        places: {
          where: { deletedAt: null },
          select: { id: true, menus: { where: { deletedAt: null }, select: { id: true } } },
        },
      },
    });
    if (!trail) throw new NotFoundError('Food trail');
    const places = new Set(trail.places.map((p) => p.id));
    const menus = new Set(trail.places.flatMap((p) => p.menus.map((m) => m.id)));
    const data = {
      placeIds: [...new Set(placeIds)].filter((id) => places.has(id)),
      menuIds: [...new Set(menuIds)].filter((id) => menus.has(id)),
    };
    const row = await prisma.foodTrailProgress.upsert({
      where: { trailId_account: { trailId, account } },
      create: { trailId, account, ...data },
      update: data,
    });
    ok(
      res,
      { account, placeIds: row.placeIds, menuIds: row.menuIds, updatedAt: row.updatedAt.toISOString() },
      'บันทึกแล้ว',
    );
  }),
);

export const publicFoodTrailModule: FeatureModule = {
  name: 'public-food-trail',
  basePath: '/public',
  router,
};
