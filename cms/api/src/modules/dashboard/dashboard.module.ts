import { Router } from 'express';
import { prisma } from '../../core/database/prisma.js';
import { authenticate } from '../../core/middleware/authenticate.js';
import { authorize } from '../../core/middleware/authorize.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { ok } from '../../core/base/BaseController.js';
import { getStorage } from '../../core/storage/index.js';
import { PERMISSIONS } from '@cms/shared';
import type { FeatureModule } from '../../core/modules.js';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  authorize(PERMISSIONS.DASHBOARD_VIEW),
  asyncHandler(async (_req, res) => {
    const [
      totalPages,
      totalDonations,
      pendingDonations,
      visitorAgg,
      recentActivities,
      recentPages,
      recentDonations,
      activeProjects,
      storageOk,
    ] = await Promise.all([
      prisma.page.count(),
      prisma.donation.count(),
      prisma.donation.count({ where: { status: { in: ['PENDING', 'AUTO_VERIFIED', 'NEEDS_REVIEW'] } } }),
      prisma.visitorStat.aggregate({ _sum: { count: true } }),
      prisma.auditLog.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true } } },
      }),
      prisma.page.findMany({
        take: 5,
        orderBy: { updatedAt: 'desc' },
        select: { id: true, title: true, path: true, status: true, updatedAt: true },
      }),
      prisma.donation.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, donationCode: true, accountName: true, amount: true,
          status: true, createdAt: true,
          project: { select: { id: true, name: true, currency: true } },
        },
      }),
      prisma.donationProject.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        take: 5,
        select: { id: true, name: true, targetAmount: true, currentAmount: true, currency: true },
      }),
      getStorage().healthCheck(),
    ]);

    let dbOk = true;
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbOk = false;
    }

    ok(res, {
      totalPages,
      totalDonations,
      pendingDonations,
      totalVisitors: visitorAgg._sum.count ?? 0,
      recentActivities: recentActivities.map((a) => ({
        id: a.id,
        userId: a.userId,
        userName: a.user?.name ?? 'System',
        action: a.action,
        resource: a.resource,
        resourceId: a.resourceId,
        createdAt: a.createdAt,
      })),
      recentPages,
      recentDonations,
      activeProjects,
      systemStatus: {
        db: dbOk ? 'ok' : 'error',
        storage: storageOk ? 'ok' : 'error',
        uptimeSeconds: Math.round(process.uptime()),
        nodeVersion: process.version,
        memoryUsageMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
    });
  }),
);

export const dashboardModule: FeatureModule = { name: 'dashboard', basePath: '/dashboard', router };
