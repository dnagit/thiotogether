import { z } from 'zod';
import { Router } from 'express';
import { prisma, rawPrisma } from '../../core/database/prisma.js';
import { logger } from '../../core/logger.js';
import { BaseRepository } from '../../core/base/BaseRepository.js';
import { BaseService } from '../../core/base/BaseService.js';
import { BaseController, ok, created } from '../../core/base/BaseController.js';
import { crudRouter } from '../../core/base/crudRouter.js';
import { authorize } from '../../core/middleware/authorize.js';
import { validate } from '../../core/middleware/validate.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { ConflictError } from '../../core/errors/AppError.js';
import { blank, blankToUndefined } from '../../core/utils/zod.js';
import { PERMISSIONS, progressPercent, slugify } from '@cms/shared';
import type { FeatureModule } from '../../core/modules.js';

// ── Validation ──────────────────────────────────────────────
export const projectSchema = z.object({
  name: z.string().min(1).max(200),
  slug: blankToUndefined(z.string().min(1).max(200).regex(/^[a-z0-9ก-๙-]+$/).optional()),
  description: z.string().min(1),
  shortDescription: blank(z.string().max(500).nullish()),
  coverImage: blank(z.string().max(500).nullish()),
  bannerImage: blank(z.string().max(500).nullish()),
  targetAmount: z.coerce.number().positive(),
  currency: z.string().max(8).default('THB'),
  /// Money per game token. Null disables token granting for this project entirely.
  tokenValue: blank(z.coerce.number().positive().nullish()),
  tokenTtlDays: blank(z.coerce.number().int().positive().nullish()),
  themeColor: blank(z.string().max(20).nullish()),
  startDate: blank(z.coerce.date().nullish()),
  endDate: blank(z.coerce.date().nullish()),
  isActive: z.boolean().default(true),
  showAmounts: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  metaTitle: blank(z.string().max(255).nullish()),
  metaDescription: blank(z.string().max(500).nullish()),
  ogImage: blank(z.string().max(500).nullish()),
});

const reorderSchema = z.object({
  orderedIds: z.array(z.number().int().positive()).min(1),
});

// ── Repository / Service ────────────────────────────────────
class ProjectRepository extends BaseRepository<any> {
  protected modelName = 'donationProject';
  protected searchFields = ['name', 'slug', 'shortDescription'];
  protected filterableFields = ['isActive', 'currency'];
  protected sortableFields = ['id', 'name', 'targetAmount', 'currentAmount', 'sortOrder', 'createdAt', 'endDate'];
  protected defaultOrderBy: Record<string, 'asc' | 'desc'> = { sortOrder: 'asc' };
  protected defaultInclude = {
    bankAccounts: { include: { bankAccount: true } },
  };
}

export class ProjectService extends BaseService<any> {
  protected repository = new ProjectRepository();
  protected resourceName = 'Donation project';

  protected async beforeCreate(data: any): Promise<any> {
    data.slug = data.slug || slugify(data.name);
    await this.assertSlugFree(data.slug);
    return this.extractBankAccounts(data);
  }

  protected async beforeUpdate(id: number, data: any): Promise<any> {
    if (data.slug) await this.assertSlugFree(data.slug, id);
    return this.extractBankAccounts(data, id);
  }

  /** Compute live stats for a project. Progress counts VERIFIED donations only. */
  async getStats(projectId: number) {
    const [project, grouped, donors] = await Promise.all([
      this.getById(projectId),
      prisma.donation.groupBy({
        by: ['status'],
        where: { projectId, deletedAt: null },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      prisma.donation.findMany({
        where: { projectId, status: 'VERIFIED', deletedAt: null },
        select: { accountName: true },
        distinct: ['accountName'],
      }),
    ]);
    const byStatus = Object.fromEntries(grouped.map((g) => [g.status, g]));
    const target = Number(project.targetAmount);
    const current = Number(byStatus.VERIFIED?._sum.amount ?? 0);
    return {
      targetAmount: target,
      currentAmount: current,
      progressPercent: progressPercent(current, target),
      remainingAmount: Math.max(0, target - current),
      donorCount: donors.length,
      pendingCount:
        (byStatus.PENDING?._count._all ?? 0) +
        (byStatus.AUTO_VERIFIED?._count._all ?? 0) +
        (byStatus.NEEDS_REVIEW?._count._all ?? 0),
      verifiedCount: byStatus.VERIFIED?._count._all ?? 0,
      rejectedCount: byStatus.REJECTED?._count._all ?? 0,
    };
  }

  /**
   * Wipe every donation and token this project produced, for rehearsing an event on real screens.
   *
   * Hard deletes through `rawPrisma`: the normal client turns `delete` into a soft delete, which
   * would leave the token grants standing and the balances untouched — the opposite of the point.
   *
   * Reservations paid for with this project's tokens go too, otherwise a board would stay full
   * with no tokens behind it. They are found through the ledger rather than through the games,
   * because that is what records which project actually funded each play.
   */
  async clearData(projectId: number): Promise<{
    donations: number;
    grants: number;
    ledgerEntries: number;
    reservations: number;
    affectedGames: Array<{ id: number; name: string; status: string }>;
  }> {
    const project = await this.getById(projectId);

    return rawPrisma.$transaction(async (tx) => {
      const spends = await tx.tokenLedgerEntry.findMany({
        where: { projectId, reservationId: { not: null } },
        select: { reservationId: true },
      });
      const reservationIds = [...new Set(spends.map((s) => s.reservationId!))];

      const affected = await tx.reservation.findMany({
        where: { id: { in: reservationIds } },
        select: { game: { select: { id: true, name: true, status: true } } },
      });
      const affectedGames = [...new Map(affected.map((r) => [r.game.id, r.game])).values()];

      // Ledger first: it points at both the grants and the reservations being removed.
      const ledgerEntries = await tx.tokenLedgerEntry.deleteMany({ where: { projectId } });
      const reservations = await tx.reservation.deleteMany({ where: { id: { in: reservationIds } } });
      const grants = await tx.tokenGrant.deleteMany({ where: { projectId } });
      // Verifications and logs cascade from the donation row.
      const donations = await tx.donation.deleteMany({ where: { projectId } });

      await tx.donationProject.update({
        where: { id: projectId },
        data: { currentAmount: 0 },
      });

      // A board that filled up is playable again now that the plays are gone. REVEALED games are
      // left alone — undoing a reveal is what the game's own reset button is for.
      for (const game of affectedGames) {
        if (game.status === 'FULL') {
          await tx.game.update({ where: { id: game.id }, data: { status: 'OPEN' } });
        }
      }

      logger.warn(
        { projectId, projectName: project.name, donations: donations.count, grants: grants.count },
        'Donation and token data cleared for a project',
      );

      return {
        donations: donations.count,
        grants: grants.count,
        ledgerEntries: ledgerEntries.count,
        reservations: reservations.count,
        affectedGames,
      };
    });
  }

  async duplicate(id: number) {
    const src = await this.getById(id);
    const slug = `${src.slug}-copy-${Date.now().toString(36)}`;
    return prisma.donationProject.create({
      data: {
        name: `${src.name} (copy)`,
        slug,
        description: src.description,
        shortDescription: src.shortDescription,
        coverImage: src.coverImage,
        bannerImage: src.bannerImage,
        targetAmount: src.targetAmount,
        currency: src.currency,
        themeColor: src.themeColor,
        isActive: false,
        sortOrder: src.sortOrder + 1,
        bankAccounts: {
          create: src.bankAccounts.map((pb: any) => ({ bankAccountId: pb.bankAccountId })),
        },
      },
    });
  }

  async reorder(orderedIds: number[]): Promise<void> {
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.donationProject.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
  }

  async setArchived(id: number, archived: boolean) {
    return this.update(id, { isActive: !archived });
  }

  /** Recompute the denormalized currentAmount from VERIFIED donations. */
  static async recomputeAmount(projectId: number, tx: any = prisma): Promise<void> {
    const sum = await tx.donation.aggregate({
      where: { projectId, status: 'VERIFIED', deletedAt: null },
      _sum: { amount: true },
    });
    await tx.donationProject.update({
      where: { id: projectId },
      data: { currentAmount: sum._sum.amount ?? 0 },
    });
  }

  private async assertSlugFree(slug: string, excludeId?: number): Promise<void> {
    const existing = await prisma.donationProject.findFirst({
      where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (existing) throw new ConflictError(`Slug "${slug}" is already in use`);
  }

  /** Accept bankAccountIds[] in the payload and sync the join table. */
  private async extractBankAccounts(data: any, projectId?: number): Promise<any> {
    const { bankAccountIds, ...rest } = data;
    if (bankAccountIds === undefined) return rest;
    if (projectId) {
      await prisma.donationProjectBankAccount.deleteMany({ where: { projectId } });
      await prisma.donationProjectBankAccount.createMany({
        data: (bankAccountIds as number[]).map((bankAccountId) => ({ projectId, bankAccountId })),
      });
      return rest;
    }
    rest.bankAccounts = {
      create: (bankAccountIds as number[]).map((bankAccountId) => ({ bankAccountId })),
    };
    return rest;
  }
}

export const projectService = new ProjectService();

/**
 * Strip every raised/target figure from a project before it goes to the public site
 * when the admin has turned amounts off.
 *
 * Done here rather than in the website so the numbers are genuinely absent from the
 * response — hiding them in the template would still leave them readable in the
 * browser's network tab.
 *
 * `targetAmount` goes too: publishing the goal alongside a hidden raised figure
 * still invites the "how far along are they?" question the setting exists to avoid.
 */
export function stripAmountsForPublic<T extends Record<string, any>>(project: T): T {
  if (project.showAmounts) return project;

  const { targetAmount: _t, currentAmount: _c, stats: _s, ...rest } = project;
  return { ...rest, showAmounts: false } as unknown as T;
}

// ── Controller & routes ─────────────────────────────────────
class ProjectController extends BaseController<any> {
  protected service: ProjectService = projectService;
}

const router: Router = crudRouter({
  controller: new ProjectController(),
  resource: 'donation-projects',
  permissions: {
    view: PERMISSIONS.DONATION_PROJECTS_VIEW,
    create: PERMISSIONS.DONATION_PROJECTS_MANAGE,
    update: PERMISSIONS.DONATION_PROJECTS_MANAGE,
    delete: PERMISSIONS.DONATION_PROJECTS_MANAGE,
  },
  createSchema: projectSchema.extend({ bankAccountIds: z.array(z.number()).optional() }),
  updateSchema: projectSchema.partial().extend({ bankAccountIds: z.array(z.number()).optional() }),
});

router.get(
  '/:id(\\d+)/stats',
  authorize(PERMISSIONS.DONATION_PROJECTS_VIEW),
  asyncHandler(async (req, res) => ok(res, await projectService.getStats(Number(req.params.id)))),
);

router.post(
  '/:id(\\d+)/duplicate',
  authorize(PERMISSIONS.DONATION_PROJECTS_MANAGE),
  asyncHandler(async (req, res) => created(res, await projectService.duplicate(Number(req.params.id)))),
);

router.post(
  '/reorder',
  authorize(PERMISSIONS.DONATION_PROJECTS_MANAGE),
  validate({ body: reorderSchema }),
  asyncHandler(async (req, res) => {
    await projectService.reorder(req.body.orderedIds);
    ok(res, null, 'Reordered');
  }),
);

/**
 * Rehearsal cleanup. Guarded by DONATIONS_DELETE — clearing a project's takings is a bigger act
 * than editing the project itself, so managing projects is not enough on its own.
 */
router.post(
  '/:id(\\d+)/clear-data',
  authorize(PERMISSIONS.DONATIONS_DELETE),
  asyncHandler(async (req, res) => {
    const result = await projectService.clearData(Number(req.params.id));
    ok(
      res,
      result,
      `ล้างข้อมูลแล้ว: ${result.donations} การบริจาค, ${result.grants} token grant, ${result.reservations} การจองป้าย`,
    );
  }),
);

router.post(
  '/:id(\\d+)/archive',
  authorize(PERMISSIONS.DONATION_PROJECTS_MANAGE),
  asyncHandler(async (req, res) => ok(res, await projectService.setArchived(Number(req.params.id), true), 'Archived')),
);

router.post(
  '/:id(\\d+)/activate',
  authorize(PERMISSIONS.DONATION_PROJECTS_MANAGE),
  asyncHandler(async (req, res) => ok(res, await projectService.setArchived(Number(req.params.id), false), 'Activated')),
);

export const donationProjectsModule: FeatureModule = {
  name: 'donation-projects',
  basePath: '/donation-projects',
  router,
};
