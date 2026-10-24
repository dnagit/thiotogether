import { z } from 'zod';
import { Router } from 'express';
import { prisma, rawPrisma } from '../../core/database/prisma.js';
import { authenticate } from '../../core/middleware/authenticate.js';
import { authorize } from '../../core/middleware/authorize.js';
import { validate } from '../../core/middleware/validate.js';
import { audit } from '../../core/middleware/audit.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { ok, created } from '../../core/base/BaseController.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../core/errors/AppError.js';
import { parseListQuery } from '../../core/utils/pagination.js';
import { blank, blankToUndefined } from '../../core/utils/zod.js';
import { isRevealed, matchRecipe, MIX_SIZE } from '../../core/garden/gardenRules.js';
import {
  loadActiveRecipes,
  recomputeDesigns,
  rotateGardenerKey,
} from '../../core/garden/gardenService.js';
import { PERMISSIONS, slugify } from '@cms/shared';
import type { FeatureModule } from '../../core/modules.js';

/**
 * Admin side of the sunflower garden: the event, its catalogues (fertiliser bags, flower
 * designs, growth stages, faces, decorations), the recipes that turn a mix into a flower,
 * and the plants themselves.
 *
 * Catalogues are edited as full replacement lists, the same shape as the birthday wall's
 * gifts: rows carry their id to keep their identity, rows that disappear are soft-deleted so
 * plants that chose them keep what they chose.
 */

// ── Validation ──────────────────────────────────────────────

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'สีต้องเป็นรหัสแบบ #a16207');
const pct = z.coerce.number().min(0).max(100);

const eventSchema = z.object({
  title: z.string().min(1).max(200),
  slug: blankToUndefined(
    z
      .string()
      .min(1)
      .max(200)
      .regex(/^[a-z0-9ก-๙-]+$/)
      .optional(),
  ),
  description: blank(z.string().nullish()),
  coverImage: blank(z.string().max(500).nullish()),
  fieldImage: blank(z.string().max(500).nullish()),
  themeColor: blank(z.string().max(20).nullish()),
  revealAt: z.coerce.date(),
  isActive: z.boolean().default(true),
  isOpen: z.boolean().default(true),
  donationProjectId: z.coerce.number().int().positive().nullish(),
  secretTokenPrice: z.coerce.number().int().min(1).max(100000).default(1),
  defaultDesignId: z.coerce.number().int().positive().nullish(),
});

const rowId = z.coerce.number().int().positive().optional();

const fertilizersSchema = z.object({
  fertilizers: z
    .array(
      z.object({
        id: rowId,
        name: z.string().min(1).max(100),
        description: blank(z.string().max(300).nullish()),
        imageUrl: blank(z.string().max(500).nullish()),
        color: hex.default('#a16207'),
        isActive: z.boolean().default(true),
      }),
    )
    .max(50),
});

const designsSchema = z.object({
  designs: z
    .array(
      z.object({
        id: rowId,
        name: z.string().min(1).max(100),
        imageUrl: z.string().min(1).max(500),
        rarity: z.enum(['common', 'rare', 'legendary']).default('common'),
        faceX: pct.nullish(),
        faceY: pct.nullish(),
        faceSize: pct.nullish(),
        onShelf: z.boolean().default(false),
        shelfOrder: z.coerce.number().int().default(0),
        allowFace: z.boolean().default(false),
        isActive: z.boolean().default(true),
      }),
    )
    .max(500),
});

const stagesSchema = z.object({
  stages: z
    .array(
      z.object({
        id: rowId,
        name: z.string().min(1).max(100),
        imageUrl: z.string().min(1).max(500),
        startsDaysBeforeReveal: z.coerce.number().int().min(0).max(3650),
      }),
    )
    .max(20),
});

const facesSchema = z.object({
  faces: z
    .array(
      z.object({
        id: rowId,
        name: blank(z.string().max(100).nullish()),
        imageUrl: z.string().min(1).max(500),
        isActive: z.boolean().default(true),
      }),
    )
    .max(500),
});

const decorationsSchema = z.object({
  decorations: z
    .array(
      z.object({
        id: rowId,
        name: z.string().min(1).max(100),
        imageUrl: z.string().min(1).max(500),
        unlockAmount: z.coerce.number().min(0),
        posX: pct.default(50),
        posY: pct.default(50),
        size: z.coerce.number().min(1).max(100).default(12),
        isActive: z.boolean().default(true),
      }),
    )
    .max(100),
});

const ingredientSchema = z
  .object({
    fertilizerId: z.coerce.number().int().positive(),
    minPct: z.coerce.number().int().min(1).max(99),
    maxPct: z.coerce.number().int().min(1).max(99),
  })
  .refine((i) => i.minPct <= i.maxPct, 'ช่วง % ต่ำสุดต้องไม่เกินสูงสุด');

const recipesSchema = z.object({
  recipes: z
    .array(
      z.object({
        id: rowId,
        name: blank(z.string().max(100).nullish()),
        designId: z.coerce.number().int().positive(),
        priority: z.coerce.number().int().min(-1000).max(1000).default(0),
        isActive: z.boolean().default(true),
        ingredients: z
          .array(ingredientSchema)
          .min(1)
          .max(MIX_SIZE)
          .refine(
            (list) => new Set(list.map((i) => i.fertilizerId)).size === list.length,
            'ปุ๋ยในสูตรซ้ำกัน',
          ),
      }),
    )
    .max(500),
});

const testSchema = z.object({
  fertilizers: z
    .array(
      z.object({ fertilizerId: z.coerce.number().int().positive(), pct: z.coerce.number().int() }),
    )
    .min(1)
    .max(MIX_SIZE),
});

const plantStatusSchema = z.object({ status: z.enum(['VISIBLE', 'HIDDEN']) });
const plantSecretSchema = z.object({
  secretDesignId: z.coerce.number().int().positive().nullable(),
});

// ── Helpers ─────────────────────────────────────────────────

const live = { where: { deletedAt: null } } as const;

const eventInclude = {
  fertilizers: { ...live, orderBy: { sortOrder: 'asc' } },
  designs: { ...live, orderBy: { sortOrder: 'asc' } },
  growthStages: { ...live, orderBy: { startsDaysBeforeReveal: 'desc' } },
  faces: { ...live, orderBy: { sortOrder: 'asc' } },
  decorations: { ...live, orderBy: { unlockAmount: 'asc' } },
  donationProject: {
    select: { id: true, name: true, slug: true, currentAmount: true, tokenValue: true },
  },
  _count: { select: { plants: { where: { deletedAt: null } } } },
} as const;

async function loadEvent(id: number) {
  const event = await rawPrisma.gardenEvent.findFirst({
    where: { id, deletedAt: null },
    include: eventInclude,
  });
  if (!event) throw new NotFoundError('Garden');
  return { ...event, revealed: isRevealed(event) };
}

async function requireEvent(id: number) {
  const event = await rawPrisma.gardenEvent.findFirst({ where: { id, deletedAt: null } });
  if (!event) throw new NotFoundError('Garden');
  return event;
}

/**
 * Replace one of an event's catalogues with the submitted list. Missing rows are soft-deleted;
 * `sortOrder` follows the array order, so reordering is a re-save.
 */
async function replaceCatalogue(
  table: { updateMany: (args: any) => Promise<unknown>; create: (args: any) => Promise<unknown> },
  eventId: number,
  rows: Array<Record<string, unknown> & { id?: number }>,
  withSortOrder = true,
): Promise<void> {
  const keptIds = rows.map((row) => row.id).filter((id): id is number => typeof id === 'number');
  await table.updateMany({
    where: { eventId, deletedAt: null, id: { notIn: keptIds.length ? keptIds : [0] } },
    data: { deletedAt: new Date() },
  });
  for (const [index, { id, ...row }] of rows.entries()) {
    const data = withSortOrder ? { ...row, sortOrder: index } : row;
    if (id) {
      // Scoped by eventId: an id from another event must not be writable.
      await table.updateMany({ where: { id, eventId }, data: { ...data, deletedAt: null } });
    } else {
      await table.create({ data: { ...data, eventId } });
    }
  }
}

// ── Routes ──────────────────────────────────────────────────

const router = Router();
router.use(authenticate, audit('garden'));

router.get(
  '/',
  authorize(PERMISSIONS.GARDEN_VIEW),
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const where: any = {};
    if (query.search) where.title = { contains: query.search, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      prisma.gardenEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
        include: {
          _count: {
            select: {
              plants: { where: { deletedAt: null } },
              fertilizers: { where: { deletedAt: null, isActive: true } },
              designs: { where: { deletedAt: null, isActive: true } },
            },
          },
        },
      }),
      prisma.gardenEvent.count({ where }),
    ]);
    ok(
      res,
      items.map((e) => ({ ...e, revealed: isRevealed(e) })),
      undefined,
      { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    );
  }),
);

router.get(
  '/:id(\\d+)',
  authorize(PERMISSIONS.GARDEN_VIEW),
  asyncHandler(async (req, res) => ok(res, await loadEvent(Number(req.params.id)))),
);

router.post(
  '/',
  authorize(PERMISSIONS.GARDEN_MANAGE),
  validate({ body: eventSchema }),
  asyncHandler(async (req, res) => {
    const slug = req.body.slug || slugify(req.body.title);
    if (await rawPrisma.gardenEvent.findFirst({ where: { slug } })) {
      throw new ConflictError(`Slug "${slug}" ถูกใช้แล้ว`);
    }
    // A default flower belongs to this event, which has none yet.
    const { defaultDesignId: _ignored, ...data } = req.body;
    const event = await rawPrisma.gardenEvent.create({ data: { ...data, slug } });
    created(res, await loadEvent(event.id));
  }),
);

router.put(
  '/:id(\\d+)',
  authorize(PERMISSIONS.GARDEN_MANAGE),
  validate({ body: eventSchema.partial() }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const current = await requireEvent(id);

    if (req.body.slug && req.body.slug !== current.slug) {
      if (
        await rawPrisma.gardenEvent.findFirst({ where: { slug: req.body.slug, id: { not: id } } })
      ) {
        throw new ConflictError(`Slug "${req.body.slug}" ถูกใช้แล้ว`);
      }
    }
    if (req.body.defaultDesignId) {
      const design = await rawPrisma.gardenFlowerDesign.findFirst({
        where: { id: req.body.defaultDesignId, eventId: id, deletedAt: null },
      });
      if (!design) throw new BadRequestError('ไม่พบแบบดอกตั้งต้นในสวนนี้');
    }

    await rawPrisma.gardenEvent.update({ where: { id }, data: req.body });
    ok(res, await loadEvent(id), 'Updated');
  }),
);

router.delete(
  '/:id(\\d+)',
  authorize(PERMISSIONS.GARDEN_MANAGE),
  asyncHandler(async (req, res) => {
    await prisma.gardenEvent.delete({ where: { id: Number(req.params.id) } });
    ok(res, null, 'Deleted');
  }),
);

// ── Catalogues ──────────────────────────────────────────────

router.put(
  '/:id(\\d+)/fertilizers',
  authorize(PERMISSIONS.GARDEN_MANAGE),
  validate({ body: fertilizersSchema }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await requireEvent(id);
    await replaceCatalogue(rawPrisma.gardenFertilizer, id, req.body.fertilizers);
    ok(res, await loadEvent(id), 'Updated');
  }),
);

router.put(
  '/:id(\\d+)/designs',
  authorize(PERMISSIONS.GARDEN_MANAGE),
  validate({ body: designsSchema }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await requireEvent(id);
    await replaceCatalogue(rawPrisma.gardenFlowerDesign, id, req.body.designs);
    ok(res, await loadEvent(id), 'Updated');
  }),
);

router.put(
  '/:id(\\d+)/stages',
  authorize(PERMISSIONS.GARDEN_MANAGE),
  validate({ body: stagesSchema }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await requireEvent(id);
    await replaceCatalogue(rawPrisma.gardenGrowthStage, id, req.body.stages);
    ok(res, await loadEvent(id), 'Updated');
  }),
);

router.put(
  '/:id(\\d+)/faces',
  authorize(PERMISSIONS.GARDEN_MANAGE),
  validate({ body: facesSchema }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await requireEvent(id);
    await replaceCatalogue(rawPrisma.gardenFace, id, req.body.faces);
    ok(res, await loadEvent(id), 'Updated');
  }),
);

router.put(
  '/:id(\\d+)/decorations',
  authorize(PERMISSIONS.GARDEN_MANAGE),
  validate({ body: decorationsSchema }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await requireEvent(id);
    await replaceCatalogue(rawPrisma.gardenDecoration, id, req.body.decorations);
    ok(res, await loadEvent(id), 'Updated');
  }),
);

// ── Recipes ─────────────────────────────────────────────────

async function listRecipes(eventId: number) {
  return rawPrisma.gardenRecipe.findMany({
    where: { eventId, deletedAt: null },
    orderBy: [{ priority: 'desc' }, { id: 'asc' }],
    include: { ingredients: { orderBy: { fertilizerId: 'asc' } } },
  });
}

router.get(
  '/:id(\\d+)/recipes',
  authorize(PERMISSIONS.GARDEN_VIEW),
  asyncHandler(async (req, res) => ok(res, await listRecipes(Number(req.params.id)))),
);

/**
 * Replaces the whole recipe book. Ingredients are rewritten per recipe — they have no identity
 * of their own worth keeping. Plants already sown keep the flower they were given; see
 * `/recompute` for re-running them.
 */
router.put(
  '/:id(\\d+)/recipes',
  authorize(PERMISSIONS.GARDEN_MANAGE),
  validate({ body: recipesSchema }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await requireEvent(id);

    const [designs, fertilizers] = await Promise.all([
      rawPrisma.gardenFlowerDesign.findMany({
        where: { eventId: id, deletedAt: null },
        select: { id: true },
      }),
      rawPrisma.gardenFertilizer.findMany({
        where: { eventId: id, deletedAt: null },
        select: { id: true },
      }),
    ]);
    const designIds = new Set(designs.map((d) => d.id));
    const fertilizerIds = new Set(fertilizers.map((f) => f.id));
    for (const recipe of req.body.recipes) {
      if (!designIds.has(recipe.designId))
        throw new BadRequestError('สูตรอ้างถึงแบบดอกที่ไม่มีในสวนนี้');
      if (
        recipe.ingredients.some((i: { fertilizerId: number }) => !fertilizerIds.has(i.fertilizerId))
      ) {
        throw new BadRequestError('สูตรอ้างถึงปุ๋ยที่ไม่มีในสวนนี้');
      }
    }

    await rawPrisma.$transaction(async (tx) => {
      const keptIds = req.body.recipes.map((r: { id?: number }) => r.id).filter(Boolean);
      await tx.gardenRecipe.updateMany({
        where: { eventId: id, deletedAt: null, id: { notIn: keptIds.length ? keptIds : [0] } },
        data: { deletedAt: new Date() },
      });
      for (const { id: recipeId, ingredients, ...data } of req.body.recipes) {
        let rowId = recipeId as number | undefined;
        if (rowId) {
          const updated = await tx.gardenRecipe.updateMany({
            where: { id: rowId, eventId: id },
            data: { ...data, deletedAt: null },
          });
          if (updated.count === 0) rowId = undefined;
        }
        if (!rowId) rowId = (await tx.gardenRecipe.create({ data: { ...data, eventId: id } })).id;
        await tx.gardenRecipeIngredient.deleteMany({ where: { recipeId: rowId } });
        await tx.gardenRecipeIngredient.createMany({
          data: ingredients.map((i: { fertilizerId: number; minPct: number; maxPct: number }) => ({
            ...i,
            recipeId: rowId,
          })),
        });
      }
    });

    ok(res, await listRecipes(id), 'Updated');
  }),
);

/** What a mix would grow right now, for the admin's recipe tester. */
router.post(
  '/:id(\\d+)/recipes/test',
  authorize(PERMISSIONS.GARDEN_VIEW),
  validate({ body: testSchema }),
  asyncHandler(async (req, res) => {
    const event = await requireEvent(Number(req.params.id));
    const recipe = matchRecipe(await loadActiveRecipes(event.id), req.body.fertilizers);
    ok(res, { recipeId: recipe?.id ?? null, designId: recipe?.designId ?? event.defaultDesignId });
  }),
);

router.post(
  '/:id(\\d+)/recompute',
  authorize(PERMISSIONS.GARDEN_MANAGE),
  asyncHandler(async (req, res) => {
    const changed = await recomputeDesigns(Number(req.params.id));
    ok(res, { changed }, `คำนวณใหม่แล้ว เปลี่ยน ${changed} ต้น`);
  }),
);

/** Opens every flower now. Irreversible in practice: people will have seen them. */
router.post(
  '/:id(\\d+)/reveal',
  authorize(PERMISSIONS.GARDEN_MANAGE),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const event = await requireEvent(id);
    if (!event.revealedAt) {
      await rawPrisma.gardenEvent.update({ where: { id }, data: { revealedAt: new Date() } });
    }
    ok(res, await loadEvent(id), 'เปิดสวนแล้ว');
  }),
);

// ── Plants ──────────────────────────────────────────────────

router.get(
  '/:id(\\d+)/plants',
  authorize(PERMISSIONS.GARDEN_VIEW),
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const where: any = { eventId: Number(req.params.id) };
    if (query.filters.status) where.status = query.filters.status;
    if (query.search) where.name = { contains: query.search, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      prisma.gardenPlant.findMany({
        where,
        orderBy: { plotIndex: 'desc' },
        skip: query.skip,
        take: query.take,
        include: {
          fertilizers: {
            orderBy: { fertilizerId: 'asc' },
            include: { fertilizer: { select: { id: true, name: true, color: true } } },
          },
          recipe: { select: { id: true, name: true } },
          design: { select: { id: true, name: true, imageUrl: true } },
          secretDesign: { select: { id: true, name: true, imageUrl: true } },
          face: { select: { id: true, imageUrl: true } },
          purchase: { select: { accountNameSnapshot: true, tokensSpent: true, createdAt: true } },
        },
      }),
      prisma.gardenPlant.count({ where }),
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
  '/plants/:plantId(\\d+)',
  authorize(PERMISSIONS.GARDEN_MANAGE),
  validate({ body: plantStatusSchema }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.plantId);
    if (!(await prisma.gardenPlant.findFirst({ where: { id } }))) throw new NotFoundError('Plant');
    await rawPrisma.gardenPlant.update({ where: { id }, data: { status: req.body.status } });
    ok(res, null, 'Updated');
  }),
);

/**
 * Changes the flower a secret fertiliser grew, for the rare case that needs a hand. The
 * purchase and its tokens stay as they were; the audit log records who changed what.
 */
router.patch(
  '/plants/:plantId(\\d+)/secret',
  authorize(PERMISSIONS.GARDEN_MANAGE),
  validate({ body: plantSecretSchema }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.plantId);
    const plant = await prisma.gardenPlant.findFirst({ where: { id } });
    if (!plant) throw new NotFoundError('Plant');
    if (req.body.secretDesignId) {
      const design = await rawPrisma.gardenFlowerDesign.findFirst({
        where: { id: req.body.secretDesignId, eventId: plant.eventId, deletedAt: null },
      });
      if (!design) throw new BadRequestError('ไม่พบแบบดอกในสวนนี้');
    }
    await rawPrisma.gardenPlant.update({
      where: { id },
      data: { secretDesignId: req.body.secretDesignId },
    });
    ok(res, null, 'Updated');
  }),
);

/**
 * A new "my garden" link for whoever sowed this plant. The old link stops working, so this is
 * for someone who has lost theirs, not for sharing.
 */
router.post(
  '/plants/:plantId(\\d+)/recovery-link',
  authorize(PERMISSIONS.GARDEN_MANAGE),
  asyncHandler(async (req, res) => {
    const plant = await prisma.gardenPlant.findFirst({
      where: { id: Number(req.params.plantId) },
      include: { event: { select: { slug: true } } },
    });
    if (!plant) throw new NotFoundError('Plant');
    const key = await rotateGardenerKey(plant.gardenerId);
    ok(res, { slug: plant.event.slug, key });
  }),
);

router.delete(
  '/plants/:plantId(\\d+)',
  authorize(PERMISSIONS.GARDEN_MANAGE),
  asyncHandler(async (req, res) => {
    await prisma.gardenPlant.delete({ where: { id: Number(req.params.plantId) } });
    ok(res, null, 'Deleted');
  }),
);

/**
 * Clears a garden of test plants before it opens. Soft deletes, so their plot numbers stay
 * taken — real sowing starts after them. Refused once anyone has bought secret fertiliser:
 * those are real tokens.
 */
router.delete(
  '/:id(\\d+)/plants',
  authorize(PERMISSIONS.GARDEN_MANAGE),
  asyncHandler(async (req, res) => {
    const eventId = Number(req.params.id);
    await requireEvent(eventId);
    if (await rawPrisma.gardenPurchase.count({ where: { eventId, deletedAt: null } })) {
      throw new ConflictError('มีต้นที่ใส่ปุ๋ยลับด้วย token แล้ว ลบทั้งหมดไม่ได้ ให้ลบทีละต้นแทน');
    }
    const { count } = await prisma.gardenPlant.deleteMany({ where: { eventId, deletedAt: null } });
    ok(res, { count }, `ลบแล้ว ${count} ต้น`);
  }),
);

export const gardenModule: FeatureModule = {
  name: 'garden',
  basePath: '/garden',
  router,
};
