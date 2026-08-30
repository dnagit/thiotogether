import { z } from 'zod';
import { Router } from 'express';
import sharp from 'sharp';
import { prisma } from '../../core/database/prisma.js';
import { authenticate } from '../../core/middleware/authenticate.js';
import { authorize } from '../../core/middleware/authorize.js';
import { validate } from '../../core/middleware/validate.js';
import { audit } from '../../core/middleware/audit.js';
import { uploadMedia, safeFileName } from '../../core/middleware/upload.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { parseListQuery, paginationMeta } from '../../core/utils/pagination.js';
import { ok, created } from '../../core/base/BaseController.js';
import { BadRequestError, NotFoundError } from '../../core/errors/AppError.js';
import { getStorage } from '../../core/storage/index.js';
import { logger } from '../../core/logger.js';
import { PERMISSIONS } from '@cms/shared';
import type { FeatureModule } from '../../core/modules.js';

function mediaType(mime: string): string {
  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime.startsWith('video/')) return 'VIDEO';
  if (mime === 'application/pdf') return 'PDF';
  return 'DOCUMENT';
}

const folderSchema = z.object({
  folder: z
    .string()
    .max(255)
    .regex(/^\/([a-z0-9-_]+(\/[a-z0-9-_]+)*)?$/, 'Invalid folder path')
    .default('/'),
});

const updateSchema = z.object({
  alt: z.string().max(255).nullish(),
  folder: folderSchema.shape.folder.optional(),
});

const THUMB_SIZE = 400;

const router = Router();
router.use(authenticate, audit('media'));

router.get(
  '/',
  authorize(PERMISSIONS.MEDIA_VIEW),
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const where: any = {};
    if (query.filters.folder) where.folder = query.filters.folder;
    /*
     * `type` takes a list as well as one value — a picker that offers pictures *and* clips
     * asks for `IMAGE,VIDEO`, which is one request rather than two merged in the browser.
     */
    if (query.filters.type) {
      const types = String(query.filters.type).split(',').filter(Boolean);
      where.type = types.length > 1 ? { in: types } : types[0];
    }
    if (query.search) {
      where.OR = [
        { originalName: { contains: query.search, mode: 'insensitive' } },
        { alt: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      prisma.media.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      prisma.media.count({ where }),
    ]);
    ok(res, items, undefined, paginationMeta(query.page, query.limit, total));
  }),
);

router.get(
  '/folders',
  authorize(PERMISSIONS.MEDIA_VIEW),
  asyncHandler(async (_req, res) => {
    const rows = await prisma.media.findMany({ select: { folder: true }, distinct: ['folder'] });
    ok(res, rows.map((r) => r.folder).sort());
  }),
);

router.post(
  '/upload',
  authorize(PERMISSIONS.MEDIA_UPLOAD),
  uploadMedia.array('files', 10),
  validate({ body: folderSchema }),
  asyncHandler(async (req, res) => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files?.length) throw new BadRequestError('No files uploaded');

    const storage = getStorage();
    const folder = req.body.folder as string;
    const prefix = `media${folder === '/' ? '' : folder}`;
    const results = [];

    for (const file of files) {
      const fileName = safeFileName(file.originalname);
      const stored = await storage.put(file.buffer, `${prefix}/${fileName}`, file.mimetype);

      let thumbnailUrl: string | null = null;
      let width: number | null = null;
      let height: number | null = null;

      if (file.mimetype.startsWith('image/') && file.mimetype !== 'image/svg+xml') {
        try {
          const image = sharp(file.buffer, { failOn: 'none' }).rotate();
          const meta = await image.metadata();
          width = meta.width ?? null;
          height = meta.height ?? null;
          const thumb = await image
            .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();
          const thumbStored = await storage.put(
            thumb,
            `${prefix}/thumbs/${fileName.replace(/\.[^.]+$/, '')}.webp`,
            'image/webp',
          );
          thumbnailUrl = thumbStored.url;
        } catch (err) {
          logger.warn({ err }, 'thumbnail generation failed');
        }
      }

      const item = await prisma.media.create({
        data: {
          fileName,
          originalName: file.originalname,
          mimeType: file.mimetype,
          type: mediaType(file.mimetype),
          size: file.size,
          url: stored.url,
          thumbnailUrl,
          folder,
          width,
          height,
          uploadedById: Number(req.auth!.sub),
        },
      });
      results.push(item);
    }
    created(res, results, `${results.length} file(s) uploaded`);
  }),
);

router.put(
  '/:id(\\d+)',
  authorize(PERMISSIONS.MEDIA_UPLOAD),
  validate({ body: updateSchema }),
  asyncHandler(async (req, res) =>
    ok(res, await prisma.media.update({ where: { id: Number(req.params.id) }, data: req.body }), 'Updated'),
  ),
);

router.delete(
  '/:id(\\d+)',
  authorize(PERMISSIONS.MEDIA_DELETE),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const item = await prisma.media.findFirst({ where: { id } });
    if (!item) throw new NotFoundError('Media');
    await prisma.media.delete({ where: { id } });
    // Physical files are kept — soft delete allows restore; a scheduled job can purge later.
    ok(res, null, 'Deleted');
  }),
);

export const mediaModule: FeatureModule = { name: 'media', basePath: '/media', router };
