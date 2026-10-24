import { createHash, randomBytes, randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { rawPrisma } from '../database/prisma.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '../errors/AppError.js';
import { findAccountIdentity, spendTokens } from '../tokens/tokenService.js';
import { assertValidAccountName } from '../tokens/accountName.js';
import { assertValidMix, isRevealed, matchRecipe, type MixPart } from './gardenRules.js';

type Tx = Prisma.TransactionClient;

/**
 * The sunflower garden's database side: sowing, secret fertiliser, and the one serializer
 * every public read goes through.
 *
 * The property everything here protects is that a flower's look stays secret until the
 * reveal. It is decided when the seed is sown and stored on the plant, but no public
 * response carries a design, a face or their pictures before `isRevealed` — with one
 * exception, the secret flower a gardener chose themselves, shown back only to them.
 */

// ── Gardener keys ──────────────────────────────────────────

/** Header the website sends the gardener key in. */
export const GARDENER_KEY_HEADER = 'x-garden-key';

const KEY_FORMAT = /^[0-9a-f]{64}$/;

/** A new key: 32 random bytes, as hex. The browser keeps it; the database keeps its hash. */
export function newGardenerKey(): string {
  return randomBytes(32).toString('hex');
}

export function hashGardenerKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** The gardener a key belongs to, in this event. Null for no key; throws for a bad one. */
export async function findGardener(
  eventId: number,
  key: string | undefined,
  client: Tx = rawPrisma,
) {
  if (!key) return null;
  if (!KEY_FORMAT.test(key)) throw new UnauthorizedError('กุญแจสวนไม่ถูกต้อง');
  const gardener = await client.gardenGardener.findUnique({
    where: { keyHash: hashGardenerKey(key) },
  });
  if (!gardener || gardener.eventId !== eventId || gardener.deletedAt) {
    throw new UnauthorizedError('ไม่พบสวนของคุณ ลิงก์อาจถูกเปลี่ยนแล้ว');
  }
  return gardener;
}

/**
 * Issues a fresh key for a gardener and retires the old one, for an admin answering "I lost
 * my garden". The browser holding the old key loses access on its next request.
 */
export async function rotateGardenerKey(gardenerId: number): Promise<string> {
  const key = newGardenerKey();
  await rawPrisma.gardenGardener.update({
    where: { id: gardenerId },
    data: { keyHash: hashGardenerKey(key) },
  });
  return key;
}

// ── Reads ──────────────────────────────────────────────────

export const designSelect = {
  id: true,
  name: true,
  imageUrl: true,
  rarity: true,
  faceX: true,
  faceY: true,
  faceSize: true,
  isActive: true,
  deletedAt: true,
} as const;

const plantInclude = {
  fertilizers: {
    orderBy: { fertilizerId: 'asc' },
    include: { fertilizer: { select: { id: true, name: true, color: true, imageUrl: true } } },
  },
  design: { select: designSelect },
  secretDesign: { select: designSelect },
  face: { select: { id: true, imageUrl: true } },
  purchase: { select: { id: true } },
} satisfies Prisma.GardenPlantInclude;

export type PlantRow = Prisma.GardenPlantGetPayload<{ include: typeof plantInclude }>;
type DesignRow = PlantRow['design'];

export async function loadPlants(where: Prisma.GardenPlantWhereInput, take?: number) {
  return rawPrisma.gardenPlant.findMany({
    where: { deletedAt: null, ...where },
    orderBy: { plotIndex: 'asc' },
    take,
    include: plantInclude,
  });
}

function publicDesign(design: NonNullable<DesignRow>) {
  return {
    id: design.id,
    name: design.name,
    imageUrl: design.imageUrl,
    rarity: design.rarity,
    faceX: design.faceX,
    faceY: design.faceY,
    faceSize: design.faceSize,
  };
}

export interface SerializeOptions {
  revealed: boolean;
  /** The gardener asking about their own plant. */
  owner?: boolean;
  /** Stands in when the design a plant grew was later deleted outright. */
  defaultDesign?: DesignRow;
  /** Leave out the message and the mix, for the field where hundreds are listed. */
  brief?: boolean;
}

/**
 * The only way a plant leaves the public API.
 *
 * Before the reveal `flower` is null for everyone except the owner of a plant with secret
 * fertiliser, and `face` is null for everyone. After it, both are filled in for all.
 */
export function serializePlant(plant: PlantRow, opts: SerializeOptions) {
  const grown = plant.secretDesign ?? plant.design ?? opts.defaultDesign ?? null;
  let flower: ReturnType<typeof publicDesign> | null = null;
  if (opts.revealed && grown) flower = publicDesign(grown);
  else if (opts.owner && plant.secretDesign) flower = publicDesign(plant.secretDesign);

  return {
    id: plant.id,
    plotIndex: plant.plotIndex,
    name: plant.name,
    plantedAt: plant.createdAt,
    flower,
    face: opts.revealed && plant.face ? { imageUrl: plant.face.imageUrl } : null,
    ...(opts.brief
      ? {}
      : {
          message: plant.message,
          fertilizers: plant.fertilizers.map((f) => ({
            id: f.fertilizer.id,
            name: f.fertilizer.name,
            color: f.fertilizer.color,
            imageUrl: f.fertilizer.imageUrl,
            pct: f.pct,
          })),
        }),
    // Whether a secret was bought is the owner's business until everyone's flowers are out.
    hasSecret: opts.revealed || opts.owner ? plant.purchase !== null : undefined,
  };
}

// ── Sowing ─────────────────────────────────────────────────

/** Active recipes whose flower still exists, with their ingredients. */
export async function loadActiveRecipes(eventId: number, client: Tx = rawPrisma) {
  return client.gardenRecipe.findMany({
    where: {
      eventId,
      deletedAt: null,
      isActive: true,
      design: { deletedAt: null, isActive: true },
    },
    include: { ingredients: true },
  });
}

/** The flower a mix grows in this event: a recipe's, or the default with no recipe. */
export async function resolveDesign(
  event: { id: number; defaultDesignId: number | null },
  mix: MixPart[],
  client: Tx = rawPrisma,
) {
  const recipe = matchRecipe(await loadActiveRecipes(event.id, client), mix);
  return { recipeId: recipe?.id ?? null, designId: recipe?.designId ?? event.defaultDesignId };
}

export interface SowInput {
  name: string;
  message: string;
  fertilizers: MixPart[];
  gardenerKey?: string;
  ipAddress: string | null;
}

/**
 * Sow one seed. Returns the plant and, when this browser had no garden yet, the key that
 * opens it — shown once, never stored in the clear.
 *
 * The event row is locked first so concurrent sowers take plot numbers one after another;
 * the unique (event, plot) index is the backstop.
 */
export async function sowPlant(eventId: number, input: SowInput) {
  const event = await rawPrisma.gardenEvent.findFirst({
    where: { id: eventId, deletedAt: null },
    include: {
      fertilizers: { where: { deletedAt: null, isActive: true }, select: { id: true } },
      defaultDesign: { select: designSelect },
    },
  });
  if (!event || !event.isActive) throw new NotFoundError('Garden');
  if (isRevealed(event)) throw new ConflictError('ทานตะวันบานแล้ว ปิดรับการปลูกแล้ว');
  if (!event.isOpen) throw new ConflictError('ปิดรับการปลูกแล้ว');
  if (!event.defaultDesign || event.defaultDesign.deletedAt || !event.defaultDesign.isActive) {
    throw new ConflictError('สวนนี้ยังไม่พร้อมให้ปลูก');
  }

  const mix = assertValidMix(
    input.fertilizers,
    event.fertilizers.map((f) => f.id),
  );
  const existing = await findGardener(event.id, input.gardenerKey);

  return rawPrisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM garden_events WHERE id = ${event.id} FOR UPDATE`;

    let gardenerId = existing?.id;
    let newKey: string | null = null;
    if (!gardenerId) {
      newKey = newGardenerKey();
      const gardener = await tx.gardenGardener.create({
        data: { eventId: event.id, keyHash: hashGardenerKey(newKey) },
      });
      gardenerId = gardener.id;
    }

    // Deleted plants count too: their plot stays empty rather than being handed on.
    const last = await tx.gardenPlant.aggregate({
      where: { eventId: event.id },
      _max: { plotIndex: true },
    });
    const { recipeId, designId } = await resolveDesign(event, mix, tx);

    const plant = await tx.gardenPlant.create({
      data: {
        eventId: event.id,
        gardenerId,
        name: input.name,
        message: input.message,
        plotIndex: (last._max.plotIndex ?? 0) + 1,
        recipeId,
        designId,
        ipAddress: input.ipAddress,
        fertilizers: { create: mix.map((p) => ({ fertilizerId: p.fertilizerId, pct: p.pct })) },
      },
      include: plantInclude,
    });

    return { plant, gardenerKey: newKey };
  });
}

// ── Secret fertiliser ──────────────────────────────────────

/** Admin-configurable account-name rule, the same one the board game reads. */
export async function accountNamePattern(): Promise<string | null> {
  const setting = await rawPrisma.setting.findUnique({ where: { key: 'account_name_pattern' } });
  const value = setting?.value as unknown;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Spendable tokens for a typed account name, in the garden's donation project only. */
export async function gardenTokenBalance(donationProjectId: number, rawName: string) {
  const displayName = assertValidAccountName(rawName, await accountNamePattern());
  const identity = await findAccountIdentity(displayName);
  if (!identity) return { found: false, displayName, tokens: 0, identity: null };

  const agg = await rawPrisma.tokenGrant.aggregate({
    where: {
      accountIdentityId: identity.id,
      projectId: donationProjectId,
      tokensRemaining: { gt: 0 },
      deletedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    _sum: { tokensRemaining: true },
  });
  return {
    found: true,
    displayName: identity.displayName,
    tokens: agg._sum.tokensRemaining ?? 0,
    identity,
  };
}

export interface SecretInput {
  plantId: number;
  designId: number;
  accountName: string;
  idempotencyKey: string;
  gardenerKey?: string;
}

/**
 * Buy secret fertiliser for one plant: spend the tokens, set the chosen flower, and draw a
 * face if the flower takes one. All or nothing.
 *
 * One per plant, for good: the unique index on `garden_purchases.plant_id` settles a race
 * between two tabs, and the loser's transaction — tokens included — rolls back whole.
 */
export async function buySecretFertilizer(eventId: number, input: SecretInput) {
  const event = await rawPrisma.gardenEvent.findFirst({ where: { id: eventId, deletedAt: null } });
  if (!event || !event.isActive) throw new NotFoundError('Garden');
  if (isRevealed(event)) throw new ConflictError('ทานตะวันบานแล้ว ใส่ปุ๋ยลับไม่ได้แล้ว');
  if (!event.donationProjectId) throw new ConflictError('สวนนี้ยังไม่เปิดชั้นปุ๋ยลับ');
  const projectId = event.donationProjectId;

  const gardener = await findGardener(event.id, input.gardenerKey);
  if (!gardener) throw new UnauthorizedError('ไม่พบสวนของคุณ');

  const replay = await rawPrisma.gardenPurchase.findUnique({
    where: { eventId_idempotencyKey: { eventId: event.id, idempotencyKey: input.idempotencyKey } },
  });
  if (replay) {
    if (replay.plantId !== input.plantId) throw new ConflictError('คำขอซ้ำกับรายการอื่น');
    return { purchaseId: replay.id, replayed: true };
  }

  const plant = await rawPrisma.gardenPlant.findFirst({
    where: { id: input.plantId, eventId: event.id, deletedAt: null },
    include: { purchase: true },
  });
  if (!plant || plant.gardenerId !== gardener.id) throw new NotFoundError('Plant');
  if (plant.purchase) throw new ConflictError('ต้นนี้ใส่ปุ๋ยลับแล้ว เปลี่ยนแบบไม่ได้');

  const design = await rawPrisma.gardenFlowerDesign.findFirst({
    where: {
      id: input.designId,
      eventId: event.id,
      deletedAt: null,
      isActive: true,
      onShelf: true,
    },
  });
  if (!design) throw new BadRequestError('ไม่พบทานตะวันแบบที่เลือก');

  const displayName = assertValidAccountName(input.accountName, await accountNamePattern());
  const identity = await findAccountIdentity(displayName);
  if (!identity) throw new BadRequestError('ไม่พบชื่อบัญชีนี้ หรือบัญชีนี้ยังไม่มี token');

  const faces = design.allowFace
    ? await rawPrisma.gardenFace.findMany({
        where: { eventId: event.id, deletedAt: null, isActive: true },
        select: { id: true },
        orderBy: { id: 'asc' },
      })
    : [];
  // Drawn by the server with a CSPRNG: the face is the surprise, and nobody may pick it.
  const faceId = faces.length ? faces[randomInt(0, faces.length)].id : null;

  try {
    const purchase = await rawPrisma.$transaction(async (tx) => {
      const row = await tx.gardenPurchase.create({
        data: {
          eventId: event.id,
          plantId: plant.id,
          designId: design.id,
          accountIdentityId: identity.id,
          accountNameSnapshot: identity.displayName,
          tokensSpent: event.secretTokenPrice,
          idempotencyKey: input.idempotencyKey,
        },
      });
      await spendTokens(tx, {
        accountIdentityId: identity.id,
        projectIds: [projectId],
        amount: event.secretTokenPrice,
        gardenPurchaseId: row.id,
        description: `ปุ๋ยลับ ${event.title} ต้นที่ ${plant.plotIndex}`,
      });
      await tx.gardenPlant.update({
        where: { id: plant.id },
        data: { secretDesignId: design.id, faceId },
      });
      return row;
    });
    return { purchaseId: purchase.id, replayed: false };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const again = await rawPrisma.gardenPurchase.findUnique({
        where: {
          eventId_idempotencyKey: { eventId: event.id, idempotencyKey: input.idempotencyKey },
        },
      });
      if (again?.plantId === plant.id) return { purchaseId: again.id, replayed: true };
      throw new ConflictError('ต้นนี้ใส่ปุ๋ยลับแล้ว เปลี่ยนแบบไม่ได้');
    }
    throw err;
  }
}

// ── Admin ──────────────────────────────────────────────────

/**
 * Re-run every plant's mix against the current recipes. Only before the reveal: afterwards
 * people have seen their flowers, and changing them would rewrite what they were shown.
 */
export async function recomputeDesigns(eventId: number): Promise<number> {
  const event = await rawPrisma.gardenEvent.findFirst({ where: { id: eventId, deletedAt: null } });
  if (!event) throw new NotFoundError('Garden');
  if (isRevealed(event)) throw new ConflictError('สวนเปิดผลแล้ว คำนวณใหม่ไม่ได้');

  const recipes = await loadActiveRecipes(event.id);
  const plants = await rawPrisma.gardenPlant.findMany({
    where: { eventId, deletedAt: null },
    select: {
      id: true,
      recipeId: true,
      designId: true,
      fertilizers: { select: { fertilizerId: true, pct: true } },
    },
  });

  let changed = 0;
  for (const plant of plants) {
    const recipe = matchRecipe(recipes, plant.fertilizers);
    const recipeId = recipe?.id ?? null;
    const designId = recipe?.designId ?? event.defaultDesignId;
    if (recipeId === plant.recipeId && designId === plant.designId) continue;
    await rawPrisma.gardenPlant.update({ where: { id: plant.id }, data: { recipeId, designId } });
    changed++;
  }
  return changed;
}
