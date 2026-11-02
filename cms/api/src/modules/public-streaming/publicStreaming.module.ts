import { z } from 'zod';
import { Router } from 'express';
import { prisma } from '../../core/database/prisma.js';
import { validate } from '../../core/middleware/validate.js';
import { accountLookupLimiter, submissionLimiter } from '../../core/middleware/rateLimit.js';
import { uploadSlip, safeFileName } from '../../core/middleware/upload.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { ok, created } from '../../core/base/BaseController.js';
import { AppError, BadRequestError, ConflictError } from '../../core/errors/AppError.js';
import { getStorage } from '../../core/storage/index.js';
import type { StreamClaimResult, StreamClaimStatus } from '@cms/shared';
import { xAccountSchema } from '../tracking/tracking.module.js';
import { claimFor, claimStatus, computeAwards } from '../streaming/streamAwards.js';
import type { FeatureModule } from '../../core/modules.js';

/**
 * The website's streaming awards block.
 *
 *   GET  /public/streaming?sessionId=      → a round's awards; the newest round without an id
 *   GET  /public/streaming/sessions        → the rounds, newest first, to browse back through
 *   POST /public/streaming/proofs          → multipart: sessionId, xAccount, streams, withYouStreams, note, image
 *   POST /public/streaming/claim/check     → { xAccount }: draws left and prizes drawn so far
 *   POST /public/streaming/claim           → { xAccount, address | sameAddress }: a winner draws a prize
 *
 * Hidden and deleted rounds are left out everywhere. Proofs arrive PENDING with the fan's own
 * count, which the admin checks against the screenshot (and corrects) before approving; until
 * then they count for nothing.
 */

const router = Router();

const awardsSchema = z.object({
  sessionId: z.coerce.number().int().positive().optional(),
});

router.get(
  '/streaming',
  validate({ query: awardsSchema }),
  asyncHandler(async (req, res) => {
    const { sessionId } = req.query as unknown as z.infer<typeof awardsSchema>;
    const session = await prisma.streamSession.findFirst({
      where: { isActive: true, ...(sessionId ? { id: sessionId } : {}) },
      orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    // Short: an approval or a draw should show within the minute.
    res.setHeader('Cache-Control', 'public, max-age=30');
    ok(res, session ? await computeAwards(session.id) : null);
  }),
);

router.get(
  '/streaming/sessions',
  asyncHandler(async (_req, res) => {
    const sessions = await prisma.streamSession.findMany({
      where: { isActive: true },
      select: { id: true, name: true, startsAt: true, endsAt: true, isOpen: true },
      orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
    });
    res.setHeader('Cache-Control', 'public, max-age=30');
    ok(res, sessions);
  }),
);

/** A count as the fan typed it; "1,234" is 1234. */
const typedCount = (song: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.replace(/[,\s]/g, '') : v),
    z.coerce.number({ invalid_type_error: `กรุณากรอกยอดสตรีม ${song} เป็นตัวเลข` }).int().min(0).max(10_000_000),
  );

const proofSchema = z.object({
  sessionId: z.coerce.number().int().positive(),
  xAccount: xAccountSchema,
  streams: typedCount('UNBOUND'),
  /** Optional: left blank, it counts as 0. */
  withYouStreams: z.preprocess((v) => (v === '' ? undefined : v), typedCount('With you to the end').optional()),
  note: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((s) => s || null),
});

router.post(
  '/streaming/proofs',
  submissionLimiter,
  // Images only, same uploader as donation slips.
  uploadSlip.single('image'),
  validate({ body: proofSchema }),
  asyncHandler(async (req, res) => {
    const { sessionId, xAccount, streams, withYouStreams, note } = req.body as z.infer<typeof proofSchema>;
    if (!req.file) throw new BadRequestError('กรุณาแนบภาพหน้าจอยอดสตรีม');

    const session = await prisma.streamSession.findFirst({
      where: { id: sessionId, isActive: true },
    });
    if (!session) throw new AppError(404, 'ไม่พบรอบสตรีมนี้', 'NOT_FOUND');
    if (!session.isOpen) throw new ConflictError('รอบนี้ปิดรับหลักฐานแล้ว');

    const key = `streaming/${session.id}/${safeFileName(req.file.originalname)}`;
    const imageUrl = (await getStorage().put(req.file.buffer, key, req.file.mimetype)).url;

    const proof = await prisma.streamProof.create({
      data: { sessionId, xAccount, streams, withYouStreams, note, imageUrl, ipAddress: req.ip ?? null },
    });
    created(res, { id: proof.id }, 'ส่งหลักฐานแล้ว รอแอดมินตรวจสอบนะคะ');
  }),
);

const checkSchema = z.object({ xAccount: xAccountSchema });

router.post(
  '/streaming/claim/check',
  accountLookupLimiter,
  validate({ body: checkSchema }),
  asyncHandler(async (req, res) => {
    const { xAccount } = req.body as z.infer<typeof checkSchema>;
    res.setHeader('Cache-Control', 'no-store');
    ok(res, (await claimStatus(xAccount)) satisfies StreamClaimStatus);
  }),
);

/**
 * Where the prize goes — asked for before the draw, so no winner is left unreachable. A
 * winner who has drawn before may send `sameAddress` instead, to reuse the last one.
 */
const claimSchema = z
  .object({
    xAccount: xAccountSchema,
    sameAddress: z.boolean().optional(),
    address: z.string().trim().max(1000).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.sameAddress) return;
    if (!body.address) {
      ctx.addIssue({ code: 'custom', path: ['address'], message: 'กรุณากรอกที่อยู่จัดส่ง' });
    } else if (body.address.length < 10) {
      ctx.addIssue({ code: 'custom', path: ['address'], message: 'กรุณากรอกชื่อ เบอร์โทร และที่อยู่จัดส่งให้ครบ' });
    }
  });

router.post(
  '/streaming/claim',
  accountLookupLimiter,
  validate({ body: claimSchema }),
  asyncHandler(async (req, res) => {
    const { xAccount, sameAddress, address } = req.body as z.infer<typeof claimSchema>;
    const { draw, awards, sessionName, remaining } = await claimFor(xAccount, sameAddress ? null : address!);
    res.setHeader('Cache-Control', 'no-store');
    ok(res, {
      xAccount: draw.xAccount,
      sessionName,
      awards,
      remaining,
      prize: { name: draw.prize.name, image: draw.prize.image },
    } satisfies StreamClaimResult);
  }),
);

export const publicStreamingModule: FeatureModule = {
  name: 'public-streaming',
  basePath: '/public',
  router,
};
