import { z } from 'zod';
import { Router, type Response } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../../core/database/prisma.js';
import { BaseRepository } from '../../core/base/BaseRepository.js';
import { BaseService } from '../../core/base/BaseService.js';
import { BaseController, ok, created } from '../../core/base/BaseController.js';
import { crudRouter } from '../../core/base/crudRouter.js';
import { authenticate } from '../../core/middleware/authenticate.js';
import { authorize } from '../../core/middleware/authorize.js';
import { audit } from '../../core/middleware/audit.js';
import { validate } from '../../core/middleware/validate.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../core/errors/AppError.js';
import { config } from '../../core/config/index.js';
import { PERMISSIONS, type DjScheduleSettings } from '@cms/shared';
import type { FeatureModule } from '../../core/modules.js';

/**
 * The DJ schedule: who is on air when.
 *
 *   /dj-schedule/djs          → standard CRUD over the DJs (name, picture)
 *   GET    /dj-schedule/slots?from=&to= → the slots touching that range, with their DJ
 *   POST   /dj-schedule/slots           → add one, or a run of them with `repeatEvery`/`repeatCount`
 *   PUT    /dj-schedule/slots/:id
 *   DELETE /dj-schedule/slots/:id       → soft delete
 *   GET/PUT /dj-schedule/settings       → the block's background, the social-post template and caption
 *   GET    /dj-schedule/assets/template  → the social-post template's bytes
 *   GET    /dj-schedule/assets/dj/:id    → a DJ's picture's bytes
 *
 * Slots may not overlap: the website's ON AIR panel names one DJ, and two slots at once would
 * leave it picking one at random.
 *
 * The public side — the calendar block — reads `/public/dj-schedule`.
 */

export const djSchema = z.object({
  name: z.string().trim().min(1).max(100),
  image: z.string().max(500).nullish(),
  note: z.string().max(500).nullish(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

class DjRepository extends BaseRepository<any> {
  protected modelName = 'dj';
  protected searchFields = ['name'];
  protected filterableFields = ['isActive'];
  protected sortableFields = ['id', 'name', 'sortOrder', 'createdAt'];
  protected defaultOrderBy: Record<string, 'asc' | 'desc'> = { sortOrder: 'asc' };
}

class DjService extends BaseService<any> {
  protected repository = new DjRepository();
  protected resourceName = 'DJ';
}

class DjController extends BaseController<any> {
  protected service = new DjService();
}

const djRouter: Router = crudRouter({
  controller: new DjController(),
  resource: 'djs',
  permissions: {
    view: PERMISSIONS.DJ_SCHEDULE_VIEW,
    create: PERMISSIONS.DJ_SCHEDULE_MANAGE,
    update: PERMISSIONS.DJ_SCHEDULE_MANAGE,
    delete: PERMISSIONS.DJ_SCHEDULE_MANAGE,
  },
  createSchema: djSchema,
  updateSchema: djSchema.partial(),
});

// ── Slots ───────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
/** A range query wider than this is a mistake, not a calendar page. */
const MAX_RANGE_MS = 100 * DAY_MS;

const slotFields = {
  djId: z.number().int().positive(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  note: z.string().max(300).nullish(),
};

const slotCreateSchema = z.object({
  ...slotFields,
  /** Make the same slot again every day or every week — `repeatCount` slots in all. */
  repeatEvery: z.enum(['day', 'week']).nullish(),
  repeatCount: z.number().int().min(1).max(60).default(1),
});

const slotUpdateSchema = z.object(slotFields);

const rangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

const slotInclude = { dj: { select: { id: true, name: true, image: true } } } as const;

/** Slots whose DJ has been deleted are gone too, though their own rows are left alone. */
const liveDj = { dj: { deletedAt: null } } as const;

function assertOrder(startsAt: Date, endsAt: Date): void {
  if (endsAt <= startsAt) throw new BadRequestError('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม');
  if (endsAt.getTime() - startsAt.getTime() > 7 * DAY_MS) {
    throw new BadRequestError('ช่วงเวลาหนึ่งยาวได้ไม่เกิน 7 วัน');
  }
}

async function assertFree(startsAt: Date, endsAt: Date, excludeId?: number): Promise<void> {
  const clash = await prisma.djSlot.findFirst({
    where: {
      ...liveDj,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    include: slotInclude,
  });
  if (clash) {
    const at = (d: Date) =>
      d.toLocaleString('th-TH', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Bangkok',
      });
    throw new ConflictError(
      `ช่วงเวลาทับกับ DJ ${clash.dj.name} (${at(clash.startsAt)} – ${at(clash.endsAt)})`,
    );
  }
}

async function assertDj(djId: number): Promise<void> {
  const dj = await prisma.dj.findFirst({ where: { id: djId } });
  if (!dj) throw new NotFoundError('DJ');
}

const slotRouter = Router();

slotRouter.get(
  '/',
  authorize(PERMISSIONS.DJ_SCHEDULE_VIEW),
  validate({ query: rangeSchema }),
  asyncHandler(async (req, res) => {
    const { from, to } = req.query as unknown as z.infer<typeof rangeSchema>;
    if (to <= from || to.getTime() - from.getTime() > MAX_RANGE_MS) {
      throw new BadRequestError('Invalid range');
    }
    const slots = await prisma.djSlot.findMany({
      where: { ...liveDj, startsAt: { lt: to }, endsAt: { gt: from } },
      include: slotInclude,
      orderBy: { startsAt: 'asc' },
    });
    ok(res, slots);
  }),
);

slotRouter.post(
  '/',
  authorize(PERMISSIONS.DJ_SCHEDULE_MANAGE),
  validate({ body: slotCreateSchema }),
  asyncHandler(async (req, res) => {
    const { djId, startsAt, endsAt, note, repeatEvery, repeatCount } = req.body as z.infer<
      typeof slotCreateSchema
    >;
    assertOrder(startsAt, endsAt);
    await assertDj(djId);

    const step = repeatEvery === 'week' ? 7 * DAY_MS : DAY_MS;
    const count = repeatEvery ? repeatCount : 1;
    const runs = Array.from({ length: count }, (_, i) => ({
      startsAt: new Date(startsAt.getTime() + i * step),
      endsAt: new Date(endsAt.getTime() + i * step),
    }));
    // A daily slot longer than a day would run into its own repeat.
    if (count > 1 && endsAt.getTime() - startsAt.getTime() > step) {
      throw new BadRequestError('ช่วงเวลายาวกว่ารอบที่ทำซ้ำ จึงทับกันเอง');
    }
    for (const run of runs) await assertFree(run.startsAt, run.endsAt);

    const made = await prisma.$transaction(
      runs.map((run) =>
        prisma.djSlot.create({ data: { djId, note: note ?? null, ...run }, include: slotInclude }),
      ),
    );
    created(res, made, count > 1 ? `เพิ่ม ${count} ช่วงเวลาแล้ว` : 'เพิ่มช่วงเวลาแล้ว');
  }),
);

slotRouter.put(
  '/:id(\\d+)',
  authorize(PERMISSIONS.DJ_SCHEDULE_MANAGE),
  validate({ body: slotUpdateSchema }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { djId, startsAt, endsAt, note } = req.body as z.infer<typeof slotUpdateSchema>;
    const existing = await prisma.djSlot.findFirst({ where: { id } });
    if (!existing) throw new NotFoundError('Slot');
    assertOrder(startsAt, endsAt);
    await assertDj(djId);
    await assertFree(startsAt, endsAt, id);

    const slot = await prisma.djSlot.update({
      where: { id },
      data: { djId, startsAt, endsAt, note: note ?? null },
      include: slotInclude,
    });
    ok(res, slot, 'บันทึกแล้ว');
  }),
);

slotRouter.delete(
  '/:id(\\d+)',
  authorize(PERMISSIONS.DJ_SCHEDULE_MANAGE),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await prisma.djSlot.findFirst({ where: { id } });
    if (!existing) throw new NotFoundError('Slot');
    await prisma.djSlot.delete({ where: { id } });
    ok(res, null, 'ลบแล้ว');
  }),
);

// ── Settings ────────────────────────────────────────────────

/**
 * Kept in the shared `settings` table rather than a table of their own, under a group the
 * public `/settings` endpoint does not expose. They have their own endpoint so that whoever
 * runs the schedule can set them without `settings.manage`, which is the whole site's.
 */
const SETTINGS_GROUP = 'dj-schedule';
const settingKey = (field: keyof DjScheduleSettings) => `djSchedule.${field}`;
const SETTING_FIELDS: Array<keyof DjScheduleSettings> = [
  'backgroundImage',
  'backgroundColor',
  'textColor',
  'socialTemplate',
  'socialCaption',
  'socialCaptionLine',
];

export async function getDjScheduleSettings(): Promise<DjScheduleSettings> {
  const rows = await prisma.setting.findMany({ where: { group: SETTINGS_GROUP } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const read = (field: keyof DjScheduleSettings) => {
    const v = byKey.get(settingKey(field));
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  };
  return {
    backgroundImage: read('backgroundImage'),
    backgroundColor: read('backgroundColor'),
    textColor: read('textColor'),
    socialTemplate: read('socialTemplate'),
    socialCaption: read('socialCaption'),
    socialCaptionLine: read('socialCaptionLine'),
  };
}

const settingsSchema = z.object({
  backgroundImage: z.string().max(500).nullish(),
  backgroundColor: z.string().max(30).nullish(),
  textColor: z.string().max(30).nullish(),
  socialTemplate: z.string().max(500).nullish(),
  socialCaption: z.string().max(5000).nullish(),
  socialCaptionLine: z.string().max(300).nullish(),
});

const settingsRouter = Router();

settingsRouter.get(
  '/',
  authorize(PERMISSIONS.DJ_SCHEDULE_VIEW),
  asyncHandler(async (_req, res) => ok(res, await getDjScheduleSettings())),
);

settingsRouter.put(
  '/',
  authorize(PERMISSIONS.DJ_SCHEDULE_MANAGE),
  validate({ body: settingsSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof settingsSchema>;
    // Only the fields sent are written: the admin saves the block's background and the
    // social-post template from different tabs, and neither may clear the other's.
    await prisma.$transaction(
      SETTING_FIELDS.filter((field) => field in body).map((field) => {
        const value = body[field]?.trim() || '';
        return prisma.setting.upsert({
          where: { key: settingKey(field) },
          create: { key: settingKey(field), value, group: SETTINGS_GROUP },
          update: { value, group: SETTINGS_GROUP, deletedAt: null },
        });
      }),
    );
    ok(res, await getDjScheduleSettings(), 'บันทึกแล้ว');
  }),
);

// ── Assets for the social-post image ────────────────────────

/*
 * The admin draws the social-post image in a <canvas> and saves it as a PNG. A canvas that has
 * drawn a picture from another origin without CORS headers refuses to be saved, and in
 * production the uploads are served by nginx, which sends none. So the pictures come through
 * here instead: same bytes, from the API's own origin, which the admin may read.
 *
 * Only pictures the schedule already names are served — the template and DJs' pictures, looked
 * up by id — never an arbitrary URL.
 */
const MAX_ASSET_BYTES = 15 * 1024 * 1024;
const uploadsDir = path.resolve(process.cwd(), config.UPLOAD_DIR);

async function readImage(url: string): Promise<{ bytes: Buffer; type: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url, config.APP_URL);
  } catch {
    throw new BadRequestError('Invalid image URL');
  }

  // Our own local upload: read it from disk rather than over the network.
  if (config.STORAGE_DRIVER === 'local' && parsed.pathname.startsWith('/uploads/')) {
    const key = decodeURIComponent(parsed.pathname.slice('/uploads/'.length));
    const file = path.resolve(uploadsDir, key);
    if (file.startsWith(uploadsDir + path.sep)) {
      try {
        const bytes = await fs.readFile(file);
        const ext = path.extname(file).slice(1).toLowerCase();
        const type = ext === 'jpg' ? 'image/jpeg' : `image/${ext === 'svg' ? 'svg+xml' : ext}`;
        return { bytes, type };
      } catch {
        // Not on this disk (a URL copied from elsewhere): fall through and fetch it.
      }
    }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestError('Invalid image URL');
  }
  const res = await fetch(parsed, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res || !res.ok) throw new NotFoundError('Image');
  const type = res.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) throw new BadRequestError('Not an image');
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_ASSET_BYTES) throw new BadRequestError('Image too large');
  return { bytes, type };
}

function sendImage(res: Response, img: { bytes: Buffer; type: string }): void {
  res.setHeader('Content-Type', img.type);
  // Never cached: a template or DJ picture swapped in the admin has to show on the next draw.
  res.setHeader('Cache-Control', 'no-store');
  res.send(img.bytes);
}

const assetRouter = Router();

assetRouter.get(
  '/template',
  authorize(PERMISSIONS.DJ_SCHEDULE_VIEW),
  asyncHandler(async (_req, res) => {
    const { socialTemplate } = await getDjScheduleSettings();
    if (!socialTemplate) throw new NotFoundError('Template');
    sendImage(res, await readImage(socialTemplate));
  }),
);

assetRouter.get(
  '/dj/:id(\\d+)',
  authorize(PERMISSIONS.DJ_SCHEDULE_VIEW),
  asyncHandler(async (req, res) => {
    const dj = await prisma.dj.findFirst({ where: { id: Number(req.params.id) } });
    if (!dj?.image) throw new NotFoundError('DJ image');
    sendImage(res, await readImage(dj.image));
  }),
);

const router = Router();
router.use('/djs', djRouter);
router.use('/assets', authenticate, assetRouter);
router.use('/settings', authenticate, audit('dj-schedule-settings'), settingsRouter);
router.use('/slots', authenticate, audit('dj-slots'), slotRouter);

export const djScheduleModule: FeatureModule = {
  name: 'dj-schedule',
  basePath: '/dj-schedule',
  router,
};
