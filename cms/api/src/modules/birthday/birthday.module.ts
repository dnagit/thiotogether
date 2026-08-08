import { z } from 'zod';
import { Router } from 'express';
import { prisma, rawPrisma } from '../../core/database/prisma.js';
import { authenticate } from '../../core/middleware/authenticate.js';
import { authorize } from '../../core/middleware/authorize.js';
import { validate } from '../../core/middleware/validate.js';
import { audit } from '../../core/middleware/audit.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { ok, created } from '../../core/base/BaseController.js';
import { ConflictError, NotFoundError } from '../../core/errors/AppError.js';
import { parseListQuery } from '../../core/utils/pagination.js';
import { blank, blankToUndefined } from '../../core/utils/zod.js';
import { PERMISSIONS, slugify } from '@cms/shared';
import type { FeatureModule } from '../../core/modules.js';

/**
 * Admin side of the birthday wish wall: the event, the two catalogues a visitor chooses
 * from — presents, and artwork for the card their wish becomes — and moderation of the
 * wishes themselves.
 *
 * A catalogue is edited as a full replacement list, the same shape as game rewards — far
 * easier to reason about than per-row diffing, and the admin table is small enough that
 * sending it whole costs nothing. Rows already chosen by a wish are kept as soft-deleted
 * rather than removed, so those wishes keep what they picked.
 */

// ── Validation ──────────────────────────────────────────────

const eventSchema = z.object({
  title: z.string().min(1).max(200),
  slug: blankToUndefined(
    z.string().min(1).max(200).regex(/^[a-z0-9ก-๙-]+$/).optional(),
  ),
  celebrantName: blank(z.string().max(150).nullish()),
  description: blank(z.string().nullish()),
  coverImage: blank(z.string().max(500).nullish()),
  themeColor: blank(z.string().max(20).nullish()),
  isOpen: z.boolean().default(true),
  isActive: z.boolean().default(true),
  requiresApproval: z.boolean().default(false),
});

const giftsSchema = z.object({
  gifts: z
    .array(
      z.object({
        /** Present for a gift being kept; absent for one just added in the UI. */
        id: z.coerce.number().int().positive().optional(),
        name: z.string().min(1).max(200),
        imageUrl: blank(z.string().max(500).nullish()),
        isActive: z.boolean().default(true),
      }),
    )
    .max(200),
});

const backgroundsSchema = z.object({
  backgrounds: z
    .array(
      z.object({
        /** Present for a background being kept; absent for one just added in the UI. */
        id: z.coerce.number().int().positive().optional(),
        name: z.string().min(1).max(200),
        /** Required, unlike a gift's image: the picture is the whole of a background. */
        imageUrl: z.string().min(1).max(500),
        isActive: z.boolean().default(true),
      }),
    )
    .max(100),
});

const wishStatusSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
});

// ── Helpers ─────────────────────────────────────────────────

const eventInclude = {
  gifts: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
  backgrounds: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
  _count: { select: { wishes: true } },
} as const;

interface CatalogueRow {
  id?: number;
  name: string;
  imageUrl?: string | null;
  isActive: boolean;
}

/**
 * Replace one of an event's catalogues with the submitted list.
 *
 * Rows that disappear are soft-deleted rather than dropped: a wish points at its gift and
 * at its background, and hard-deleting would either fail on the constraint or null out
 * something someone already chose. `sortOrder` is rewritten from the array order, so
 * reordering in the admin table is just a re-save.
 *
 * The two tables differ only in whether `imageUrl` may be null, which the schemas above
 * have already settled by the time a list gets here.
 */
async function replaceCatalogue(
  table: typeof rawPrisma.birthdayGift | typeof rawPrisma.birthdayCardBackground,
  eventId: number,
  rows: CatalogueRow[],
): Promise<void> {
  const keptIds = rows.map((row) => row.id).filter((id): id is number => typeof id === 'number');

  await (table as any).updateMany({
    where: { eventId, deletedAt: null, id: { notIn: keptIds.length ? keptIds : [0] } },
    data: { deletedAt: new Date() },
  });

  for (const [index, row] of rows.entries()) {
    const data = {
      name: row.name,
      imageUrl: row.imageUrl ?? null,
      isActive: row.isActive,
      sortOrder: index,
    };
    if (row.id) {
      // `updateMany` scoped by eventId: an id from another event must not be writable.
      await (table as any).updateMany({
        where: { id: row.id, eventId },
        data: { ...data, deletedAt: null },
      });
    } else {
      await (table as any).create({ data: { ...data, eventId } });
    }
  }
}

// ── Routes ──────────────────────────────────────────────────

const router = Router();
router.use(authenticate, audit('birthday'));

router.get(
  '/',
  authorize(PERMISSIONS.BIRTHDAY_VIEW),
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const where: any = {};
    if (query.search) where.title = { contains: query.search, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      prisma.birthdayEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
        include: eventInclude,
      }),
      prisma.birthdayEvent.count({ where }),
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
  authorize(PERMISSIONS.BIRTHDAY_VIEW),
  asyncHandler(async (req, res) => {
    const event = await prisma.birthdayEvent.findFirst({
      where: { id: Number(req.params.id) },
      include: eventInclude,
    });
    if (!event) throw new NotFoundError('Birthday event');
    ok(res, event);
  }),
);

router.post(
  '/',
  authorize(PERMISSIONS.BIRTHDAY_MANAGE),
  validate({ body: eventSchema }),
  asyncHandler(async (req, res) => {
    const slug = req.body.slug || slugify(req.body.title);
    if (await rawPrisma.birthdayEvent.findFirst({ where: { slug } })) {
      throw new ConflictError(`Slug "${slug}" ถูกใช้แล้ว`);
    }

    const event = await rawPrisma.birthdayEvent.create({ data: { ...req.body, slug } });
    created(
      res,
      await prisma.birthdayEvent.findFirst({ where: { id: event.id }, include: eventInclude }),
    );
  }),
);

router.put(
  '/:id(\\d+)',
  authorize(PERMISSIONS.BIRTHDAY_MANAGE),
  validate({ body: eventSchema.partial() }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const current = await rawPrisma.birthdayEvent.findUnique({ where: { id } });
    if (!current) throw new NotFoundError('Birthday event');

    if (req.body.slug && req.body.slug !== current.slug) {
      if (await rawPrisma.birthdayEvent.findFirst({ where: { slug: req.body.slug, id: { not: id } } })) {
        throw new ConflictError(`Slug "${req.body.slug}" ถูกใช้แล้ว`);
      }
    }

    await rawPrisma.birthdayEvent.update({ where: { id }, data: req.body });
    ok(res, await prisma.birthdayEvent.findFirst({ where: { id }, include: eventInclude }), 'Updated');
  }),
);

router.delete(
  '/:id(\\d+)',
  authorize(PERMISSIONS.BIRTHDAY_MANAGE),
  asyncHandler(async (req, res) => {
    await prisma.birthdayEvent.delete({ where: { id: Number(req.params.id) } });
    ok(res, null, 'Deleted');
  }),
);

// ── Gift catalogue ──────────────────────────────────────────

router.put(
  '/:id(\\d+)/gifts',
  authorize(PERMISSIONS.BIRTHDAY_MANAGE),
  validate({ body: giftsSchema }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!(await rawPrisma.birthdayEvent.findUnique({ where: { id } }))) {
      throw new NotFoundError('Birthday event');
    }
    await replaceCatalogue(rawPrisma.birthdayGift, id, req.body.gifts);
    ok(res, await prisma.birthdayEvent.findFirst({ where: { id }, include: eventInclude }), 'Updated');
  }),
);

// ── Card backgrounds ────────────────────────────────────────

router.put(
  '/:id(\\d+)/backgrounds',
  authorize(PERMISSIONS.BIRTHDAY_MANAGE),
  validate({ body: backgroundsSchema }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!(await rawPrisma.birthdayEvent.findUnique({ where: { id } }))) {
      throw new NotFoundError('Birthday event');
    }
    await replaceCatalogue(rawPrisma.birthdayCardBackground, id, req.body.backgrounds);
    ok(res, await prisma.birthdayEvent.findFirst({ where: { id }, include: eventInclude }), 'Updated');
  }),
);

// ── Wishes (moderation) ─────────────────────────────────────

router.get(
  '/:id(\\d+)/wishes',
  authorize(PERMISSIONS.BIRTHDAY_VIEW),
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const where: any = { eventId: Number(req.params.id) };
    if (query.filters.status) where.status = query.filters.status;
    if (query.search) where.name = { contains: query.search, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      prisma.birthdayWish.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
        include: {
          gift: { select: { id: true, name: true, imageUrl: true } },
          background: { select: { id: true, name: true, imageUrl: true } },
        },
      }),
      prisma.birthdayWish.count({ where }),
    ]);
    ok(res, items, undefined, {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    });
  }),
);

router.patch(
  '/wishes/:wishId(\\d+)',
  authorize(PERMISSIONS.BIRTHDAY_MODERATE),
  validate({ body: wishStatusSchema }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.wishId);
    if (!(await rawPrisma.birthdayWish.findUnique({ where: { id } }))) {
      throw new NotFoundError('Wish');
    }
    await rawPrisma.birthdayWish.update({ where: { id }, data: { status: req.body.status } });
    ok(res, null, 'Updated');
  }),
);

router.delete(
  '/wishes/:wishId(\\d+)',
  authorize(PERMISSIONS.BIRTHDAY_MODERATE),
  asyncHandler(async (req, res) => {
    await prisma.birthdayWish.delete({ where: { id: Number(req.params.wishId) } });
    ok(res, null, 'Deleted');
  }),
);

export const birthdayModule: FeatureModule = {
  name: 'birthday',
  basePath: '/birthday',
  router,
};
