import { z } from 'zod';
import { Router } from 'express';
import { prisma } from '../../core/database/prisma.js';
import { BaseRepository } from '../../core/base/BaseRepository.js';
import { BaseService } from '../../core/base/BaseService.js';
import { BaseController, created } from '../../core/base/BaseController.js';
import { crudRouter } from '../../core/base/crudRouter.js';
import { authorize } from '../../core/middleware/authorize.js';
import { validate } from '../../core/middleware/validate.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { NotFoundError } from '../../core/errors/AppError.js';
import { PERMISSIONS } from '@cms/shared';
import type { FeatureModule } from '../../core/modules.js';

/**
 * Parcel tracking numbers, grouped into projects, that fans look up by their X account.
 *
 *   /tracking/projects            → standard CRUD over the projects
 *   /tracking/entries?projectId=  → standard CRUD over one project's tracking numbers
 *   POST /tracking/entries/bulk   → many at once, pasted from a spreadsheet
 *
 * The public side — the lookup block — reads `/public/tracking/lookup`.
 */

/** "@Name " and "name" are the same account: the "@" is dropped and the case ignored on lookup. */
export const xAccountSchema = z
  .string()
  .transform((s) => s.trim().replace(/^@+/, '').trim())
  .pipe(z.string().min(1).max(100));

const trackingNoSchema = z.string().trim().min(1).max(100);

export const trackingProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(1000).nullish(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

class TrackingProjectRepository extends BaseRepository<any> {
  protected modelName = 'trackingProject';
  protected searchFields = ['name'];
  protected filterableFields = ['isActive'];
  protected sortableFields = ['id', 'name', 'sortOrder', 'createdAt'];
  protected defaultOrderBy: Record<string, 'asc' | 'desc'> = { sortOrder: 'asc' };
  // The soft-delete extension filters top-level queries only, so the count says so itself.
  protected defaultInclude = {
    _count: { select: { entries: { where: { deletedAt: null } } } },
  };
}

class TrackingProjectService extends BaseService<any> {
  protected repository = new TrackingProjectRepository();
  protected resourceName = 'Tracking project';
}

class TrackingProjectController extends BaseController<any> {
  protected service = new TrackingProjectService();
}

const projectRouter: Router = crudRouter({
  controller: new TrackingProjectController(),
  resource: 'tracking-projects',
  permissions: {
    view: PERMISSIONS.TRACKING_VIEW,
    create: PERMISSIONS.TRACKING_MANAGE,
    update: PERMISSIONS.TRACKING_MANAGE,
    delete: PERMISSIONS.TRACKING_MANAGE,
  },
  createSchema: trackingProjectSchema,
  updateSchema: trackingProjectSchema.partial(),
});

// ── Entries ─────────────────────────────────────────────────

const entrySchema = z.object({
  projectId: z.number().int().positive(),
  xAccount: xAccountSchema,
  trackingNo: trackingNoSchema,
});

const bulkSchema = z.object({
  projectId: z.number().int().positive(),
  rows: z
    .array(z.object({ xAccount: xAccountSchema, trackingNo: trackingNoSchema }))
    .min(1)
    .max(5000),
});

async function assertProject(projectId: number): Promise<void> {
  const project = await prisma.trackingProject.findFirst({ where: { id: projectId } });
  if (!project) throw new NotFoundError('Tracking project');
}

class TrackingEntryRepository extends BaseRepository<any> {
  protected modelName = 'trackingEntry';
  protected searchFields = ['xAccount', 'trackingNo'];
  protected filterableFields = ['projectId'];
  protected sortableFields = ['id', 'xAccount', 'trackingNo', 'createdAt'];
  protected defaultOrderBy: Record<string, 'asc' | 'desc'> = { xAccount: 'asc' };
}

class TrackingEntryService extends BaseService<any> {
  protected repository = new TrackingEntryRepository();
  protected resourceName = 'Tracking entry';

  protected async beforeCreate(data: any): Promise<any> {
    await assertProject(data.projectId);
    return data;
  }

  protected async beforeUpdate(_id: number, data: any): Promise<any> {
    if (data.projectId) await assertProject(data.projectId);
    return data;
  }
}

class TrackingEntryController extends BaseController<any> {
  protected service = new TrackingEntryService();
}

const entryRouter: Router = crudRouter({
  controller: new TrackingEntryController(),
  resource: 'tracking-entries',
  permissions: {
    view: PERMISSIONS.TRACKING_VIEW,
    create: PERMISSIONS.TRACKING_MANAGE,
    update: PERMISSIONS.TRACKING_MANAGE,
    delete: PERMISSIONS.TRACKING_MANAGE,
  },
  createSchema: entrySchema,
  updateSchema: entrySchema.partial(),
});

// `crudRouter` has already put authentication and the audit log in front of this.
entryRouter.post(
  '/bulk',
  authorize(PERMISSIONS.TRACKING_MANAGE),
  validate({ body: bulkSchema }),
  asyncHandler(async (req, res) => {
    const { projectId, rows } = req.body as z.infer<typeof bulkSchema>;
    await assertProject(projectId);
    const { count } = await prisma.trackingEntry.createMany({
      data: rows.map((r) => ({ projectId, ...r })),
    });
    created(res, { created: count }, `เพิ่ม ${count} รายการแล้ว`);
  }),
);

const router = Router();
router.use('/projects', projectRouter);
router.use('/entries', entryRouter);

export const trackingModule: FeatureModule = {
  name: 'tracking',
  basePath: '/tracking',
  router,
};
