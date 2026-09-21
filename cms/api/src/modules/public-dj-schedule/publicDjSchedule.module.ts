import { z } from 'zod';
import { Router } from 'express';
import { prisma } from '../../core/database/prisma.js';
import { validate } from '../../core/middleware/validate.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { ok } from '../../core/base/BaseController.js';
import { BadRequestError } from '../../core/errors/AppError.js';
import { config } from '../../core/config/index.js';
import type { PublicDjSchedule } from '@cms/shared';
import { getDjScheduleSettings } from '../dj-schedule/djSchedule.module.js';
import type { FeatureModule } from '../../core/modules.js';

/**
 * The DJ schedule for the website's calendar block.
 *
 *   GET /public/dj-schedule?from=&to= → { now, onAir, next, slots }
 *
 * `slots` is whatever touches the range — the calendar asks for the weeks it draws. `onAir`
 * and `next` are worked out from the server clock regardless of the range, so the panel above
 * the calendar stays right while a visitor pages through other months.
 *
 * `appearance` is the block's background, set on the admin's DJ schedule screen.
 *
 * Hidden DJs (`isActive: false`) and deleted ones take their slots with them.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const rangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

const slotSelect = {
  id: true,
  startsAt: true,
  endsAt: true,
  note: true,
  dj: { select: { id: true, name: true, image: true } },
} as const;

const visible = { dj: { deletedAt: null, isActive: true } } as const;

const router = Router();

router.get(
  '/dj-schedule',
  validate({ query: rangeSchema }),
  asyncHandler(async (req, res) => {
    const { from, to } = req.query as unknown as z.infer<typeof rangeSchema>;
    if (to <= from || to.getTime() - from.getTime() > 45 * DAY_MS) {
      throw new BadRequestError('Invalid range');
    }
    const now = new Date();

    const [slots, onAir, next, appearance] = await Promise.all([
      prisma.djSlot.findMany({
        where: { ...visible, startsAt: { lt: to }, endsAt: { gt: from } },
        select: slotSelect,
        orderBy: { startsAt: 'asc' },
      }),
      prisma.djSlot.findFirst({
        where: { ...visible, startsAt: { lte: now }, endsAt: { gt: now } },
        select: slotSelect,
        orderBy: { startsAt: 'desc' },
      }),
      prisma.djSlot.findFirst({
        where: { ...visible, startsAt: { gt: now } },
        select: slotSelect,
        orderBy: { startsAt: 'asc' },
      }),
      getDjScheduleSettings(),
    ]);

    // Short: the ON AIR panel changes hands on the hour and should not lag it by much.
    res.setHeader('Cache-Control', config.isProd ? 'public, max-age=30' : 'no-store');
    ok(res, { now, onAir, next, slots, appearance } as unknown as PublicDjSchedule);
  }),
);

export const publicDjScheduleModule: FeatureModule = {
  name: 'public-dj-schedule',
  basePath: '/public',
  router,
};
