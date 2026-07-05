import { Router } from 'express';
import { prisma } from '../../core/database/prisma.js';
import { authenticate } from '../../core/middleware/authenticate.js';
import { authorize } from '../../core/middleware/authorize.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { ok } from '../../core/base/BaseController.js';
import { parseListQuery, paginationMeta } from '../../core/utils/pagination.js';
import { PERMISSIONS } from '@cms/shared';
import type { FeatureModule } from '../../core/modules.js';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  authorize(PERMISSIONS.AUDIT_LOGS_VIEW),
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const where: any = {};
    if (query.filters.resource) where.resource = query.filters.resource;
    if (query.filters.action) where.action = query.filters.action;
    if (query.filters.userId) where.userId = Number(query.filters.userId);
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      prisma.auditLog.count({ where }),
    ]);
    ok(res, items, undefined, paginationMeta(query.page, query.limit, total));
  }),
);

export const auditLogsModule: FeatureModule = {
  name: 'audit-logs',
  basePath: '/audit-logs',
  router,
};
