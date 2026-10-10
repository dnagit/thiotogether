import { z } from 'zod';
import { Router } from 'express';
import { prisma } from '../../core/database/prisma.js';
import { validate } from '../../core/middleware/validate.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { ok } from '../../core/base/BaseController.js';
import type { PublicFoodTrail } from '@cms/shared';
import { placeOrder } from '../food-trail/foodTrail.module.js';
import type { FeatureModule } from '../../core/modules.js';

/**
 * The food trail for the website's checklist block.
 *
 *   GET /public/food-trail?trailId= → one trail's restaurants and dishes, names only
 *
 * Without `trailId`, the first trail shown on the web. Pictures are deliberately left out:
 * they are the admin's, for the poster. What a fan has ticked stays in their own browser.
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

export const publicFoodTrailModule: FeatureModule = {
  name: 'public-food-trail',
  basePath: '/public',
  router,
};
