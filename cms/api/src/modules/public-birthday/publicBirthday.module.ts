import { z } from 'zod';
import { Router } from 'express';
import { prisma, rawPrisma } from '../../core/database/prisma.js';
import { validate } from '../../core/middleware/validate.js';
import { submissionLimiter } from '../../core/middleware/rateLimit.js';
import { uploadSlip, safeFileName } from '../../core/middleware/upload.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { ok, created } from '../../core/base/BaseController.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../core/errors/AppError.js';
import { getStorage } from '../../core/storage/index.js';
import type { FeatureModule } from '../../core/modules.js';

/**
 * Unauthenticated endpoints behind the birthday wish wall.
 *
 * Two rules hold everywhere here:
 *  - Only APPROVED wishes are ever returned, and never the moderation columns
 *    (`ipAddress`, `status`) that sit beside them.
 *  - The photo is stored as uploaded and the framing kept as three numbers next to it.
 *    Baking the crop into the file would throw away the rest of the picture, and the
 *    balloon shape it is framed against is a rendering decision the website may change.
 */

const router = Router();

/** Shapes the website can draw. An unknown value would render as a blank balloon. */
const BALLOON_SHAPES = ['round', 'long', 'heart', 'star', 'gem', 'sunflower', 'dog', 'cat'] as const;

const wishSchema = z.object({
  name: z.string().trim().min(1).max(60),
  message: z.string().trim().min(1).max(300),
  balloonShape: z.enum(BALLOON_SHAPES).default('round'),
  /** Hex only: the value goes straight into an SVG `fill`. The default matches the website's. */
  balloonColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'balloonColor must be a hex colour like #e11d48')
    .default('#e11d48'),
  giftId: z.coerce.number().int().positive().optional(),
  /** Card artwork. Absent is a legitimate choice: the plain card. */
  backgroundId: z.coerce.number().int().positive().optional(),
  /**
   * Framing, as produced by the form's editor. Bounds are generous on purpose — the
   * exact travel a photo has depends on its aspect ratio, which only the browser knows.
   * These reject nonsense without second-guessing a legitimate crop.
   */
  photoZoom: z.coerce.number().min(1).max(3).optional(),
  photoX: z.coerce.number().min(-500).max(500).optional(),
  photoY: z.coerce.number().min(-500).max(500).optional(),
});

/**
 * Public projection of a catalogue row — a gift or a card background. The admin's ordering
 * and activity flags stay behind; what is left is what the picker draws.
 */
const catalogueSelect = { id: true, name: true, imageUrl: true } as const;
const activeRows = {
  where: { deletedAt: null, isActive: true },
  orderBy: { sortOrder: 'asc' },
  select: catalogueSelect,
} as const;

async function findEvent(slug: string) {
  const event = await prisma.birthdayEvent.findFirst({
    where: { slug, isActive: true },
    include: { gifts: activeRows, backgrounds: activeRows },
  });
  if (!event) throw new NotFoundError('Birthday event');
  return event;
}

router.get(
  '/birthday/:slug',
  asyncHandler(async (req, res) => {
    const event = await findEvent(req.params.slug);
    ok(res, {
      slug: event.slug,
      title: event.title,
      celebrantName: event.celebrantName,
      description: event.description,
      coverImage: event.coverImage,
      themeColor: event.themeColor,
      isOpen: event.isOpen,
      gifts: event.gifts,
      backgrounds: event.backgrounds,
    });
  }),
);

router.get(
  '/birthday/:slug/wishes',
  asyncHandler(async (req, res) => {
    const event = await findEvent(req.params.slug);

    const wishes = await prisma.birthdayWish.findMany({
      where: { eventId: event.id, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
      // Capped: the wall renders every wish as a live animation, and a runaway list
      // would put thousands of moving elements on a phone.
      take: 300,
      select: {
        id: true,
        name: true,
        message: true,
        balloonShape: true,
        balloonColor: true,
        photoUrl: true,
        photoZoom: true,
        photoX: true,
        photoY: true,
        createdAt: true,
        gift: { select: catalogueSelect },
        background: { select: catalogueSelect },
      },
    });

    ok(
      res,
      wishes.map(({ photoZoom, photoX, photoY, ...wish }) => ({
        ...wish,
        // Nested for the website, which treats framing as one value it can pass around.
        photoFraming:
          photoZoom === null ? null : { zoom: photoZoom, x: photoX ?? 0, y: photoY ?? 0 },
      })),
    );
  }),
);

router.post(
  '/birthday/:slug/wishes',
  submissionLimiter,
  // Images only, same uploader as donation slips.
  uploadSlip.single('photo'),
  validate({ body: wishSchema }),
  asyncHandler(async (req, res) => {
    const event = await findEvent(req.params.slug);
    if (!event.isOpen) throw new ConflictError('ปิดรับคำอวยพรแล้ว');

    // Checked against the *active* catalogues, so a retired row cannot be posted by id.
    if (req.body.giftId !== undefined && !event.gifts.some((g) => g.id === req.body.giftId)) {
      throw new BadRequestError('ไม่พบของขวัญที่เลือก');
    }
    if (
      req.body.backgroundId !== undefined &&
      !event.backgrounds.some((b) => b.id === req.body.backgroundId)
    ) {
      throw new BadRequestError('ไม่พบพื้นหลังการ์ดที่เลือก');
    }

    let photoUrl: string | null = null;
    if (req.file) {
      const storage = getStorage();
      const key = `birthday/${event.slug}/${safeFileName(req.file.originalname)}`;
      photoUrl = (await storage.put(req.file.buffer, key, req.file.mimetype)).url;
    }

    const wish = await rawPrisma.birthdayWish.create({
      data: {
        eventId: event.id,
        name: req.body.name,
        message: req.body.message,
        balloonShape: req.body.balloonShape,
        balloonColor: req.body.balloonColor,
        giftId: req.body.giftId ?? null,
        backgroundId: req.body.backgroundId ?? null,
        photoUrl,
        // Framing is meaningless without a photo, so it is only kept alongside one.
        photoZoom: photoUrl ? (req.body.photoZoom ?? 1) : null,
        photoX: photoUrl ? (req.body.photoX ?? 0) : null,
        photoY: photoUrl ? (req.body.photoY ?? 0) : null,
        status: event.requiresApproval ? 'PENDING' : 'APPROVED',
        ipAddress: req.ip ?? null,
      },
    });

    created(
      res,
      { id: wish.id, status: wish.status },
      event.requiresApproval
        ? 'ส่งคำอวยพรแล้ว รอผู้ดูแลตรวจสอบก่อนขึ้นบนกำแพง'
        : 'ส่งคำอวยพรเรียบร้อยแล้ว คำอวยพรกำลังลอยไปหาเจ้าของวันเกิดแล้วนะ',
    );
  }),
);

export const publicBirthdayModule: FeatureModule = {
  name: 'public-birthday',
  basePath: '/public',
  router,
};
