import { z } from 'zod';
import { Router, type Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { validate } from '../../core/middleware/validate.js';
import { jooxVoteEditLimiter, jooxVoteLimiter } from '../../core/middleware/rateLimit.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { ok, created } from '../../core/base/BaseController.js';
import { AppError, BadRequestError, ConflictError } from '../../core/errors/AppError.js';
import {
  JOOX_VOTE_TARGET,
  jooxLinkKey,
  jooxNameKey,
  jooxVoteDay,
  jooxVoteTypeOf,
  type JooxVoteAccount,
  type JooxVoteType,
} from '@cms/shared';
import type { FeatureModule } from '../../core/modules.js';
import { requireJooxVoter } from '../joox-voters/jooxVoterAuth.js';
import { broadcastJooxVote, closeJooxVoteStreams, openJooxVoteStream } from './jooxVoteStream.js';

/**
 * The shared JOOX voting checklist behind `/joox-vote` on the website.
 *
 * One list for everybody who can get in: every signed-in voter sees every account and can
 * add, count, finish and delete — and sees everyone else doing it as it happens, over the
 * event stream in `jooxVoteStream.ts`. Getting in means a login an admin handed out, checked
 * by `requireJooxVoter` on every route below, the event stream included; see
 * `joox-voters/jooxVoterAuth.ts`. That login is not an admin account and grants nothing but
 * this page.
 *
 * A login narrows who can reach the list but not what a voter can do to it, so what kept the
 * open version honest still applies:
 *  - Links must be http(s). Every voter's browser renders them as hrefs, so a stored
 *    `javascript:` URL would run in the page of whoever tapped it.
 *  - Deletes are soft. A wiped list can be put back from the table.
 *  - Adds and deletes are rate limited tighter than taps.
 *
 * Each account is an artist or a song (`type`). An add that doesn't say which goes by the
 * "(s)" / "(a)" marker in the name, if there is one, and is an artist otherwise. Duplicates
 * are judged within a type: an artist and a song may share a name or a link.
 *
 * The 23:00 Thai-time reset needs no scheduled job. Each row keeps the voting day its count
 * belongs to; reads report a past day as zero, and the first write of a new day starts the
 * count over in the same UPDATE that adds to it. A restart across 23:00 cannot miss it.
 */

const router = Router();

/*
 * Every route in this module, the event stream included — mounted before them all so a route
 * added later cannot be left open by forgetting to guard it.
 */
router.use('/joox-votes', requireJooxVoter);

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
  type: z.enum(['ARTIST', 'SONG']).optional(),
});

const typeSchema = z.object({
  type: z.enum(['ARTIST', 'SONG'], { message: 'กรุณาเลือก Artist หรือ Song' }),
});

const idParams = z.object({ id: z.coerce.number().int().positive() });

const missingSchema = z.object({
  missing: z.coerce.number().int().min(1).max(JOOX_VOTE_TARGET),
});

/** The same ceiling as the score on `/joox-accounts`, so a sum of them stays a number. */
const SCORE_MAX = 1_000_000_000;
const scoreSchema = z.object({
  score: z.coerce
    .number()
    .int('คะแนนต้องเป็นจำนวนเต็ม')
    .min(0, 'คะแนนต้องไม่ติดลบ')
    .max(SCORE_MAX, 'คะแนนสูงเกินไป'),
});

interface Row {
  id: number;
  accountName: string;
  link: string;
  type: JooxVoteType;
  clicks: number;
  isDone: boolean;
  voteDay: number;
  score: number;
}

/** What leaves the API: today's count, or zero for a row not touched since the last reset. */
function toPublic(row: Row, today: number): JooxVoteAccount {
  const current = row.voteDay >= today;
  return {
    id: row.id,
    accountName: row.accountName,
    link: row.link,
    type: row.type,
    clicks: current ? row.clicks : 0,
    isDone: current ? row.isDone : false,
    score: row.score,
  };
}

/**
 * A name or link already held by another account of the same type, in Thai, naming that
 * account — or null when there is none. `exceptId` leaves out the account being changed.
 */
async function findClash(
  type: JooxVoteType,
  nameKey: string | null,
  linkKey: string | null,
  exceptId?: number,
): Promise<string | null> {
  // A null key is a deleted row's; matching on it would find every other deleted row.
  const keys = [nameKey && { nameKey }, linkKey && { linkKey }].filter(
    (k): k is { nameKey: string } | { linkKey: string } => Boolean(k),
  );
  if (keys.length === 0) return null;
  const clash = await prisma.jooxVoteAccount.findFirst({
    where: {
      type,
      id: exceptId === undefined ? undefined : { not: exceptId },
      OR: keys,
    },
    select: { accountName: true, nameKey: true },
  });
  if (!clash) return null;
  const label = type === 'SONG' ? 'Song' : 'Artist';
  return clash.nameKey === nameKey
    ? `มีบัญชี ${label} ชื่อ “${clash.accountName}” อยู่ในรายการแล้ว`
    : `ลิงก์นี้ใช้กับบัญชี ${label} “${clash.accountName}” อยู่แล้ว`;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** Someone else deleted it first — the list on this phone is behind. Says so in Thai. */
function gone(): AppError {
  return new AppError(404, 'ไม่พบบัญชีนี้ อาจถูกลบไปแล้ว', 'NOT_FOUND');
}

const rowSelect = {
  id: true,
  accountName: true,
  link: true,
  type: true,
  clicks: true,
  isDone: true,
  voteDay: true,
  score: true,
} as const;

/**
 * `RETURNING` in the shape of {@link Row}, for the two raw UPDATEs below. Those set
 * `updated_at` by hand, since they bypass Prisma, and in UTC, which is how Prisma stores
 * every other timestamp in the table.
 */
const RETURNING = Prisma.sql`RETURNING id, account_name AS "accountName", link, type, clicks,
  is_done AS "isDone", vote_day AS "voteDay", score`;

/** The account as it now stands: to the phone that changed it, and to every phone watching. */
function answer(res: Response, account: JooxVoteAccount): void {
  ok(res, account);
  broadcastJooxVote({ type: 'account', account });
}

/** Live updates; see {@link openJooxVoteStream}. */
router.get('/joox-votes/events', openJooxVoteStream);

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
    const body = req.body as z.infer<typeof accountSchema>;
    const { accountName, link } = body;
    const type = body.type ?? jooxVoteTypeOf(accountName) ?? 'ARTIST';
    const nameKey = jooxNameKey(accountName);
    const linkKey = jooxLinkKey(link);
    // The URL parser percent-encodes Thai in a path, so the key can outgrow the link itself.
    if (linkKey.length > 500) throw new BadRequestError('ลิงก์ยาวเกินไป');

    // Checked first for a message that names the account already holding the name or link;
    // the unique indexes below are what actually settle a race.
    const clash = await findClash(type, nameKey, linkKey);
    if (clash) throw new ConflictError(clash);

    const today = jooxVoteDay();
    try {
      const row = await prisma.jooxVoteAccount.create({
        data: {
          accountName,
          link,
          type,
          nameKey,
          linkKey,
          voteDay: today,
        },
        select: rowSelect,
      });
      const account = toPublic(row, today);
      created(res, account, 'เพิ่มบัญชีแล้ว');
      broadcastJooxVote({ type: 'account', account });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError('มีบัญชีหรือลิงก์นี้อยู่ในรายการแล้ว');
      throw err;
    }
  }),
);

/**
 * One vote link opened. Atomic, so taps from several phones at once all count. The tap that
 * brings the count to {@link JOOX_VOTE_TARGET} marks the account done in the same UPDATE.
 */
router.post(
  '/joox-votes/:id/click',
  jooxVoteLimiter,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const today = jooxVoteDay();
    const [row] = await prisma.$queryRaw<Row[]>`
      UPDATE joox_vote_accounts
      SET clicks     = CASE WHEN vote_day >= ${today} THEN clicks + 1 ELSE 1 END,
          is_done    = CASE WHEN vote_day >= ${today}
                            THEN is_done OR clicks + 1 >= ${JOOX_VOTE_TARGET}
                            ELSE 1 >= ${JOOX_VOTE_TARGET} END,
          vote_day   = GREATEST(vote_day, ${today}),
          updated_at = NOW() AT TIME ZONE 'UTC'
      WHERE id = ${Number(req.params.id)} AND deleted_at IS NULL
      ${RETURNING}`;
    if (!row) throw gone();
    answer(res, toPublic(row, today));
  }),
);

/**
 * Done, but some of today's taps didn't become votes: the count goes back to what it should
 * have been, and the account is open again until taps bring it back up to the target.
 * A report about a day that has since been reset changes nothing — today starts from zero.
 */
router.post(
  '/joox-votes/:id/missing',
  jooxVoteLimiter,
  validate({ params: idParams, body: missingSchema }),
  asyncHandler(async (req, res) => {
    const { missing } = req.body as z.infer<typeof missingSchema>;
    const today = jooxVoteDay();
    const [row] = await prisma.$queryRaw<Row[]>`
      UPDATE joox_vote_accounts
      SET clicks     = CASE WHEN vote_day >= ${today} THEN ${JOOX_VOTE_TARGET - missing} ELSE 0 END,
          is_done    = false,
          vote_day   = GREATEST(vote_day, ${today}),
          updated_at = NOW() AT TIME ZONE 'UTC'
      WHERE id = ${Number(req.params.id)} AND deleted_at IS NULL
      ${RETURNING}`;
    if (!row) throw gone();
    answer(res, toPublic(row, today));
  }),
);

/** Finished voting with this account for today, without waiting for the taps to add up. */
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
    answer(res, toPublic(row, today));
  }),
);

/** The score, as typed. Not on the 23:00 clock, so today's count and tick are left as they are. */
router.patch(
  '/joox-votes/:id/score',
  jooxVoteLimiter,
  validate({ params: idParams, body: scoreSchema }),
  asyncHandler(async (req, res) => {
    const { score } = req.body as z.infer<typeof scoreSchema>;
    const today = jooxVoteDay();
    const [row] = await prisma.$queryRaw<Row[]>`
      UPDATE joox_vote_accounts
      SET score      = ${score},
          updated_at = NOW() AT TIME ZONE 'UTC'
      WHERE id = ${Number(req.params.id)} AND deleted_at IS NULL
      ${RETURNING}`;
    if (!row) throw gone();
    answer(res, toPublic(row, today));
  }),
);

/**
 * Artist or song, switched by hand. Leaves today's count, tick and score as they are. Refused
 * when the other type already has an account of this name or link.
 */
router.patch(
  '/joox-votes/:id/type',
  jooxVoteLimiter,
  validate({ params: idParams, body: typeSchema }),
  asyncHandler(async (req, res) => {
    const { type } = req.body as z.infer<typeof typeSchema>;
    const id = Number(req.params.id);
    const current = await prisma.jooxVoteAccount.findFirst({
      where: { id, deletedAt: null },
      select: { nameKey: true, linkKey: true },
    });
    if (!current) throw gone();
    const clash = await findClash(type, current.nameKey, current.linkKey, id);
    if (clash) throw new ConflictError(clash);

    const today = jooxVoteDay();
    try {
      const [row] = await prisma.$queryRaw<Row[]>`
        UPDATE joox_vote_accounts
        SET type       = ${type}::"JooxVoteType",
            updated_at = NOW() AT TIME ZONE 'UTC'
        WHERE id = ${id} AND deleted_at IS NULL
        ${RETURNING}`;
      if (!row) throw gone();
      answer(res, toPublic(row, today));
    } catch (err) {
      // A raw query reports the index's refusal as Postgres's own code rather than P2002.
      const raw = err as Prisma.PrismaClientKnownRequestError;
      if (isUniqueViolation(err) || (raw?.code === 'P2010' && raw.meta?.code === '23505')) {
        throw new ConflictError('มีบัญชีหรือลิงก์นี้อยู่ในประเภทนั้นแล้ว');
      }
      throw err;
    }
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
    broadcastJooxVote({ type: 'removed', id: Number(req.params.id) });
  }),
);

export const publicJooxVotesModule: FeatureModule = {
  name: 'public-joox-votes',
  basePath: '/public',
  router,
  onShutdown: closeJooxVoteStreams,
};
