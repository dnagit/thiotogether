import { z } from 'zod';
import { Router } from 'express';
import { prisma } from '../../core/database/prisma.js';
import { validate } from '../../core/middleware/validate.js';
import { accountLookupLimiter } from '../../core/middleware/rateLimit.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { ok } from '../../core/base/BaseController.js';
import type { PublicTrackingList, PublicTrackingLookup } from '@cms/shared';
import { xAccountSchema } from '../tracking/tracking.module.js';
import type { FeatureModule } from '../../core/modules.js';

/**
 * Tracking numbers for the website's lookup block.
 *
 *   POST /public/tracking/lookup { xAccount, projectId? } → that account's numbers, by project
 *   GET  /public/tracking/list?projectId=               → every account and number, by project
 *
 * The lookup needs the whole account name (ignoring case and a leading "@"), and is rate
 * limited like the token check. The list is for a block set to show everything — the admin's
 * choice to publish the numbers openly.
 *
 * Hidden projects (`isActive: false`) and deleted ones are left out.
 */

const lookupSchema = z.object({
  xAccount: xAccountSchema,
  /** The block may be set to one project; without it every visible project is searched. */
  projectId: z.number().int().positive().nullish(),
});

const router = Router();

router.post(
  '/tracking/lookup',
  accountLookupLimiter,
  validate({ body: lookupSchema }),
  asyncHandler(async (req, res) => {
    const { xAccount, projectId } = req.body as z.infer<typeof lookupSchema>;
    const entries = await prisma.trackingEntry.findMany({
      where: {
        xAccount: { equals: xAccount, mode: 'insensitive' },
        project: { deletedAt: null, isActive: true, ...(projectId ? { id: projectId } : {}) },
      },
      select: {
        trackingNo: true,
        project: { select: { id: true, name: true, description: true } },
      },
      orderBy: [{ project: { sortOrder: 'asc' } }, { projectId: 'asc' }, { id: 'asc' }],
    });

    const projects: PublicTrackingLookup['projects'] = [];
    for (const e of entries) {
      let group = projects[projects.length - 1];
      if (group?.id !== e.project.id) {
        group = { ...e.project, trackingNos: [] };
        projects.push(group);
      }
      group.trackingNos.push(e.trackingNo);
    }

    res.setHeader('Cache-Control', 'no-store');
    ok(res, { xAccount, projects } satisfies PublicTrackingLookup);
  }),
);

const listSchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
});

router.get(
  '/tracking/list',
  validate({ query: listSchema }),
  asyncHandler(async (req, res) => {
    const { projectId } = req.query as unknown as z.infer<typeof listSchema>;
    const projects = await prisma.trackingProject.findMany({
      where: { isActive: true, ...(projectId ? { id: projectId } : {}) },
      select: {
        id: true,
        name: true,
        description: true,
        entries: {
          where: { deletedAt: null },
          select: { xAccount: true, trackingNo: true },
          orderBy: [{ xAccount: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });

    // Short: a number the admin has just added should show within the minute.
    res.setHeader('Cache-Control', 'public, max-age=30');
    ok(res, { projects } satisfies PublicTrackingList);
  }),
);

export const publicTrackingModule: FeatureModule = {
  name: 'public-tracking',
  basePath: '/public',
  router,
};
