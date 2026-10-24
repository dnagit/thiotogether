import { z } from 'zod';
import { Router, type Request } from 'express';
import { rawPrisma } from '../../core/database/prisma.js';
import { validate } from '../../core/middleware/validate.js';
import {
  accountLookupLimiter,
  gardenSowLimiter,
  reserveLimiter,
} from '../../core/middleware/rateLimit.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { ok, created } from '../../core/base/BaseController.js';
import { NotFoundError, UnauthorizedError } from '../../core/errors/AppError.js';
import { decorationProgress, isRevealed } from '../../core/garden/gardenRules.js';
import {
  GARDENER_KEY_HEADER,
  buySecretFertilizer,
  designSelect,
  findGardener,
  gardenTokenBalance,
  loadPlants,
  serializePlant,
  sowPlant,
} from '../../core/garden/gardenService.js';
import type { FeatureModule } from '../../core/modules.js';

/**
 * Unauthenticated endpoints behind the sunflower garden.
 *
 * Every plant leaves through `serializePlant`, which is what keeps each flower's look off the
 * wire until the reveal. "My garden" is opened by the key a browser was handed when it first
 * sowed, sent in the `x-garden-key` header — see `core/garden/gardenService.ts`.
 */

const router = Router();

/** Plants per page on the field. The website pages through until it has them all. */
const FIELD_PAGE = 500;

const sowSchema = z.object({
  name: z.string().trim().min(1).max(60),
  message: z.string().trim().min(1).max(300),
  fertilizers: z
    .array(
      z.object({
        fertilizerId: z.coerce.number().int().positive(),
        pct: z.coerce.number().int(),
      }),
    )
    .length(2),
});

const accountSchema = z.object({ accountName: z.string().min(1).max(190) });

const secretSchema = z.object({
  designId: z.coerce.number().int().positive(),
  accountName: z.string().min(1).max(190),
  /** Client-generated; makes a retried or double-clicked purchase harmless. */
  idempotencyKey: z.string().min(8).max(64),
});

const gardenerKey = (req: Request) => req.get(GARDENER_KEY_HEADER) || undefined;

async function findEvent(slug: string) {
  const event = await rawPrisma.gardenEvent.findFirst({
    where: { slug, isActive: true, deletedAt: null },
    include: {
      fertilizers: {
        where: { deletedAt: null, isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, description: true, imageUrl: true, color: true },
      },
      growthStages: {
        where: { deletedAt: null },
        orderBy: { startsDaysBeforeReveal: 'desc' },
        select: { id: true, name: true, imageUrl: true, startsDaysBeforeReveal: true },
      },
      decorations: { where: { deletedAt: null, isActive: true } },
      defaultDesign: { select: designSelect },
      donationProject: {
        select: { slug: true, name: true, currentAmount: true, showAmounts: true, deletedAt: true },
      },
    },
  });
  if (!event) throw new NotFoundError('Garden');
  return event;
}

type GardenEventRow = Awaited<ReturnType<typeof findEvent>>;

/** The donation project, unless it has since been deleted. */
const projectOf = (event: GardenEventRow) =>
  event.donationProject && !event.donationProject.deletedAt ? event.donationProject : null;

router.get(
  '/garden/:slug',
  asyncHandler(async (req, res) => {
    const event = await findEvent(req.params.slug);
    const revealed = isRevealed(event);
    const project = projectOf(event);

    const raised = project ? Number(project.currentAmount) : 0;
    const { unlocked, next } = decorationProgress(event.decorations, raised);

    const [plantCount, shelfCount] = await Promise.all([
      rawPrisma.gardenPlant.count({
        where: { eventId: event.id, deletedAt: null, status: 'VISIBLE' },
      }),
      rawPrisma.gardenFlowerDesign.count({
        where: { eventId: event.id, deletedAt: null, isActive: true, onShelf: true },
      }),
    ]);

    const ready =
      event.fertilizers.length >= 2 &&
      !!event.defaultDesign &&
      !event.defaultDesign.deletedAt &&
      event.defaultDesign.isActive;

    ok(res, {
      slug: event.slug,
      title: event.title,
      description: event.description,
      coverImage: event.coverImage,
      fieldImage: event.fieldImage,
      themeColor: event.themeColor,
      revealAt: event.revealAt,
      revealed,
      serverTime: new Date(),
      isOpen: event.isOpen && !revealed && ready,
      plantCount,
      fertilizers: event.fertilizers,
      growthStages: event.growthStages,
      decorations: unlocked.map((d) => ({
        id: d.id,
        name: d.name,
        imageUrl: d.imageUrl,
        posX: d.posX,
        posY: d.posY,
        size: d.size,
      })),
      nextDecoration: next
        ? {
            name: next.name,
            // The figures only when the project shows its figures; otherwise just how far along.
            ...(project?.showAmounts
              ? { raised, unlockAmount: Number(next.unlockAmount) }
              : { percent: Math.min(99, Math.floor((raised / Number(next.unlockAmount)) * 100)) }),
          }
        : null,
      shelf: {
        enabled: !!project && shelfCount > 0 && !revealed,
        price: event.secretTokenPrice,
        donationSlug: project?.slug ?? null,
        donationName: project?.name ?? null,
      },
    });
  }),
);

router.get(
  '/garden/:slug/plants',
  asyncHandler(async (req, res) => {
    const event = await findEvent(req.params.slug);
    const revealed = isRevealed(event);
    const after = Math.max(0, Number(req.query.after) || 0);
    // `full=1` adds each message and mix, for the page that lists every card.
    const brief = req.query.full !== '1';

    const plants = await loadPlants(
      { eventId: event.id, status: 'VISIBLE', plotIndex: { gt: after } },
      FIELD_PAGE,
    );
    ok(res, {
      plants: plants.map((p) =>
        serializePlant(p, { revealed, brief, defaultDesign: event.defaultDesign }),
      ),
      nextAfter: plants.length === FIELD_PAGE ? plants[plants.length - 1].plotIndex : null,
    });
  }),
);

router.get(
  '/garden/:slug/plants/:id(\\d+)',
  asyncHandler(async (req, res) => {
    const event = await findEvent(req.params.slug);
    const [plant] = await loadPlants({ id: Number(req.params.id), eventId: event.id });
    if (!plant) throw new NotFoundError('Plant');

    // A hidden plant is gone from the field, but its owner can still open their own card.
    let owner = false;
    const key = gardenerKey(req);
    if (key) {
      try {
        owner = (await findGardener(event.id, key))?.id === plant.gardenerId;
      } catch {
        owner = false;
      }
    }
    if (plant.status !== 'VISIBLE' && !owner) throw new NotFoundError('Plant');

    ok(
      res,
      serializePlant(plant, {
        revealed: isRevealed(event),
        owner,
        defaultDesign: event.defaultDesign,
      }),
    );
  }),
);

router.post(
  '/garden/:slug/plants',
  gardenSowLimiter,
  validate({ body: sowSchema }),
  asyncHandler(async (req, res) => {
    const event = await findEvent(req.params.slug);
    const { plant, gardenerKey: newKey } = await sowPlant(event.id, {
      name: req.body.name,
      message: req.body.message,
      fertilizers: req.body.fertilizers,
      gardenerKey: gardenerKey(req),
      ipAddress: req.ip ?? null,
    });

    created(
      res,
      {
        plant: serializePlant(plant, { revealed: false, owner: true }),
        // Present only for a browser sowing its first seed. The website keeps it.
        gardenerKey: newKey,
      },
      'หย่อนเมล็ดเรียบร้อยแล้ว',
    );
  }),
);

router.get(
  '/garden/:slug/mine',
  asyncHandler(async (req, res) => {
    const event = await findEvent(req.params.slug);
    const gardener = await findGardener(event.id, gardenerKey(req));
    if (!gardener) throw new UnauthorizedError('ไม่พบสวนของคุณ');

    const revealed = isRevealed(event);
    const plants = await loadPlants({ eventId: event.id, gardenerId: gardener.id });
    ok(res, {
      plants: plants.map((p) =>
        serializePlant(p, { revealed, owner: true, defaultDesign: event.defaultDesign }),
      ),
    });
  }),
);

router.get(
  '/garden/:slug/shelf',
  asyncHandler(async (req, res) => {
    const event = await findEvent(req.params.slug);
    const enabled = !!projectOf(event) && !isRevealed(event);
    const designs = enabled
      ? await rawPrisma.gardenFlowerDesign.findMany({
          where: { eventId: event.id, deletedAt: null, isActive: true, onShelf: true },
          orderBy: [{ shelfOrder: 'asc' }, { id: 'asc' }],
          select: { id: true, name: true, imageUrl: true, rarity: true, allowFace: true },
        })
      : [];
    ok(res, { enabled, price: event.secretTokenPrice, designs });
  }),
);

/** Rate limited like the game's lookup: the answer is what a name-guesser wants. */
router.post(
  '/garden/:slug/tokens',
  accountLookupLimiter,
  validate({ body: accountSchema }),
  asyncHandler(async (req, res) => {
    const event = await findEvent(req.params.slug);
    const project = projectOf(event);
    if (!project || !event.donationProjectId) {
      ok(res, { found: false, displayName: req.body.accountName, tokens: 0 });
      return;
    }
    const { found, displayName, tokens } = await gardenTokenBalance(
      event.donationProjectId,
      req.body.accountName,
    );
    ok(res, { found, displayName, tokens });
  }),
);

router.post(
  '/garden/:slug/plants/:id(\\d+)/secret',
  reserveLimiter,
  validate({ body: secretSchema }),
  asyncHandler(async (req, res) => {
    const event = await findEvent(req.params.slug);
    const result = await buySecretFertilizer(event.id, {
      plantId: Number(req.params.id),
      designId: req.body.designId,
      accountName: req.body.accountName,
      idempotencyKey: req.body.idempotencyKey,
      gardenerKey: gardenerKey(req),
    });

    const [plant] = await loadPlants({ id: Number(req.params.id), eventId: event.id });
    const balance = event.donationProjectId
      ? await gardenTokenBalance(event.donationProjectId, req.body.accountName)
      : { tokens: 0 };

    ok(
      res,
      {
        plant: serializePlant(plant, {
          revealed: isRevealed(event),
          owner: true,
          defaultDesign: event.defaultDesign,
        }),
        remainingTokens: balance.tokens,
        replayed: result.replayed,
      },
      'ใส่ปุ๋ยลับเรียบร้อยแล้ว ทานตะวันต้นนี้จะบานเป็นแบบที่เลือกในวันเปิดผล',
    );
  }),
);

export const publicGardenModule: FeatureModule = {
  name: 'public-garden',
  basePath: '/public',
  router,
};
