import { z } from 'zod';
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { validate } from '../../core/middleware/validate.js';
import { jooxVoteEditLimiter, jooxVoteLimiter } from '../../core/middleware/rateLimit.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { ok, created } from '../../core/base/BaseController.js';
import { AppError, BadRequestError, ConflictError } from '../../core/errors/AppError.js';
import {
  jooxLinkKey,
  jooxNameKey,
  jooxVoteDay,
  type JooxVoteAccount,
} from '@cms/shared';
import type { FeatureModule } from '../../core/modules.js';

/**
 * The shared JOOX voting checklist behind `/joox-vote` on the website.
 *
 * One list for everybody and no login: anyone on the page sees every account and can add,
 * count, finish and delete. What keeps that from going wrong is here rather than in a login:
 *  - Links must be http(s). Every visitor's browser renders them as hrefs, so a stored
 *    `javascript:` URL would run in the page of whoever tapped it.
 *  - Deletes are soft. A wiped list can be put back from the table.
 *  - Adds and deletes are rate limited tighter than taps.
 *
 * The 23:00 Thai-time reset needs no scheduled job. Each row keeps the voting day its count
 * belongs to; reads report a past day as zero, and the first write of a new day starts the
 * count over in the same UPDATE that adds to it. A restart across 23:00 cannot miss it.
 */

const router = Router();

const accountSchema = z.object({
  accountName: z.string().trim().min(1, 'กรุณากรอกชื่อบัญชี').max(100, 'ชื่อบัญชียาวเกินไป'),
  link: z
    .string()
    .trim()
    .max(500, 'ลิงก์ยาวเกินไป')
    .refine((value) => {
      try {
        return ['http:', 'https:'].includes(new URL(value).protocol);
      } catch {
        return false;
      }
    }, 'กรุณากรอกลิงก์โหวตที่ขึ้นต้นด้วย https://'),
});

const idParams = z.object({ id: z.coerce.number().int().positive() });

interface Row {
  id: number;
  accountName: string;
  link: string;
  clicks: number;
  isDone: boolean;
  voteDay: number;
}

/** What leaves the API: today's count, or zero for a row not touched since the last reset. */
function toPublic(row: Row, today: number): JooxVoteAccount {
  const current = row.voteDay >= today;
  return {
    id: row.id,
    accountName: row.accountName,
    link: row.link,
    clicks: current ? row.clicks : 0,
    isDone: current ? row.isDone : false,
  };
}

/** Someone else deleted it first — the list on this phone is behind. Says so in Thai. */
function gone(): AppError {
  return new AppError(404, 'ไม่พบบัญชีนี้ อาจถูกลบไปแล้ว', 'NOT_FOUND');
}

const rowSelect = {
  id: true,
  accountName: true,
  link: true,
  clicks: true,
  isDone: true,
  voteDay: true,
} as const;

/**
 * `RETURNING` in the shape of {@link Row}, for the two raw UPDATEs below. Those set
 * `updated_at` by hand, since they bypass Prisma, and in UTC, which is how Prisma stores
 * every other timestamp in the table.
 */
const RETURNING = Prisma.sql`RETURNING id, account_name AS "accountName", link, clicks,
  is_done AS "isDone", vote_day AS "voteDay"`;

router.get(
  '/joox-votes',
  asyncHandler(async (_req, res) => {
    const today = jooxVoteDay();
    const rows = await prisma.jooxVoteAccount.findMany({
      orderBy: { id: 'asc' },
      select: rowSelect,
    });
    ok(
      res,
      rows.map((row) => toPublic(row, today)),
    );
  }),
);

router.post(
  '/joox-votes',
  jooxVoteEditLimiter,
  validate({ body: accountSchema }),
  asyncHandler(async (req, res) => {
    const { accountName, link } = req.body as z.infer<typeof accountSchema>;
    const nameKey = jooxNameKey(accountName);
    const linkKey = jooxLinkKey(link);
    // The URL parser percent-encodes Thai in a path, so the key can outgrow the link itself.
    if (linkKey.length > 500) throw new BadRequestError('ลิงก์ยาวเกินไป');

    // Checked first for a message that names the account already holding the name or link;
    // the unique indexes below are what actually settle a race.
    const clash = await prisma.jooxVoteAccount.findFirst({
      where: { OR: [{ nameKey }, { linkKey }] },
      select: { accountName: true, nameKey: true },
    });
    if (clash) {
      throw new ConflictError(
        clash.nameKey === nameKey
          ? `มีบัญชีชื่อ “${clash.accountName}” อยู่ในรายการแล้ว`
          : `ลิงก์นี้ใช้กับบัญชี “${clash.accountName}” อยู่แล้ว`,
      );
    }

    const today = jooxVoteDay();
    try {
      const row = await prisma.jooxVoteAccount.create({
        data: { accountName, link, nameKey, linkKey, voteDay: today },
        select: rowSelect,
      });
      created(res, toPublic(row, today), 'เพิ่มบัญชีแล้ว');
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('มีบัญชีหรือลิงก์นี้อยู่ในรายการแล้ว');
      }
      throw err;
    }
  }),
);

/** One vote link opened. Atomic, so taps from several phones at once all count. */
router.post(
  '/joox-votes/:id/click',
  jooxVoteLimiter,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const today = jooxVoteDay();
    const [row] = await prisma.$queryRaw<Row[]>`
      UPDATE joox_vote_accounts
      SET clicks     = CASE WHEN vote_day >= ${today} THEN clicks + 1 ELSE 1 END,
          is_done    = CASE WHEN vote_day >= ${today} THEN is_done ELSE false END,
          vote_day   = GREATEST(vote_day, ${today}),
          updated_at = NOW() AT TIME ZONE 'UTC'
      WHERE id = ${Number(req.params.id)} AND deleted_at IS NULL
      ${RETURNING}`;
    if (!row) throw gone();
    ok(res, toPublic(row, today));
  }),
);

/** Finished voting with this account for today. Undone by the reset, not by a button. */
router.post(
  '/joox-votes/:id/done',
  jooxVoteLimiter,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const today = jooxVoteDay();
    const [row] = await prisma.$queryRaw<Row[]>`
      UPDATE joox_vote_accounts
      SET is_done    = true,
          clicks     = CASE WHEN vote_day >= ${today} THEN clicks ELSE 0 END,
          vote_day   = GREATEST(vote_day, ${today}),
          updated_at = NOW() AT TIME ZONE 'UTC'
      WHERE id = ${Number(req.params.id)} AND deleted_at IS NULL
      ${RETURNING}`;
    if (!row) throw gone();
    ok(res, toPublic(row, today));
  }),
);

router.delete(
  '/joox-votes/:id',
  jooxVoteEditLimiter,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    // Soft, and the duplicate keys cleared so the name and link can be added again.
    const { count } = await prisma.jooxVoteAccount.updateMany({
      where: { id: Number(req.params.id), deletedAt: null },
      data: { deletedAt: new Date(), nameKey: null, linkKey: null },
    });
    if (count === 0) throw gone();
    ok(res, null, 'ลบบัญชีแล้ว');
  }),
);

export const publicJooxVotesModule: FeatureModule = {
  name: 'public-joox-votes',
  basePath: '/public',
  router,
};
