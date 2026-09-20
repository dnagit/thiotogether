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
  JOOX_VOTES_PER_ACCOUNT,
  isJooxAccountUser,
  jooxAccountUserKey,
  jooxVoteDay,
  type JooxAccount,
} from '@cms/shared';
import type { FeatureModule } from '../../core/modules.js';
import { requireJooxVoter } from '../joox-voters/jooxVoterAuth.js';

/**
 * A voter's own JOOX logins, behind `/joox-accounts` on the website.
 *
 *   GET    /public/joox-accounts            → this voter's accounts, with today's votes
 *   POST   /public/joox-accounts            → add { accountName, accountUser, note, score }
 *   PATCH  /public/joox-accounts/:id        → the same four fields
 *   PATCH  /public/joox-accounts/:id/score  → { score } alone, for the quick edit on the card
 *   DELETE /public/joox-accounts/:id
 *   PUT    /public/joox-accounts/:id/votes  → { voteAccountIds }: today's votes, the whole set
 *
 * Unlike the shared checklist, every row belongs to the voter who added it and no one else
 * reads it: it holds emails and phone numbers. Every query below is scoped by `voterId`, so an
 * id belonging to somebody else answers exactly as one that doesn't exist.
 *
 * Votes go to accounts on the shared checklist (`public-joox-votes`), up to
 * {@link JOOX_VOTES_PER_ACCOUNT} a day per account. Recording them here does nothing to the
 * checklist's own counts — the two pages are kept apart on purpose. The 23:00 Thai-time reset
 * is the same as there: each vote carries its voting day, and reads ask for today's.
 */

const router = Router();

// Every route in this module, mounted before them all — see the same line in publicJooxVotes.
router.use('/joox-accounts', requireJooxVoter);

/**
 * The score a voter keeps for one account.
 *
 * Whole and never negative, and capped a long way below `Int`'s ceiling so that the sum the
 * page shows cannot overflow either — adding up a few hundred accounts has to stay a number.
 *
 * Absent means zero rather than an error: the field did not exist before this, so a page
 * cached from before it saving a whole account leaves the score at nothing instead of being
 * rejected. Written as its own shape because the account schema below takes it too.
 */
const SCORE_MAX = 1_000_000_000;
const scoreShape = {
  score: z.coerce
    .number()
    .int('คะแนนต้องเป็นจำนวนเต็ม')
    .min(0, 'คะแนนต้องไม่ติดลบ')
    .max(SCORE_MAX, 'คะแนนสูงเกินไป')
    .default(0),
};

const scoreSchema = z.object(scoreShape);

const accountSchema = z.object({
  accountName: z.string().trim().min(1, 'กรุณากรอกชื่อบัญชี').max(100, 'ชื่อบัญชียาวเกินไป'),
  accountUser: z
    .string()
    .trim()
    .min(1, 'กรุณากรอกอีเมลหรือเบอร์โทร')
    .max(100, 'อีเมลหรือเบอร์โทรยาวเกินไป')
    .refine(isJooxAccountUser, 'กรุณากรอกอีเมลหรือเบอร์โทรให้ถูกต้อง'),
  note: z
    .string()
    .trim()
    .max(1000, 'โน้ตยาวเกินไป')
    .nullish()
    .transform((value) => value || null),
  ...scoreShape,
});

const idParams = z.object({ id: z.coerce.number().int().positive() });

const votesSchema = z.object({
  voteAccountIds: z
    .array(z.number().int().positive())
    .max(JOOX_VOTES_PER_ACCOUNT, `บัญชีหนึ่งโหวตได้วันละ ${JOOX_VOTES_PER_ACCOUNT} ครั้ง`)
    .refine((ids) => new Set(ids).size === ids.length, 'เลือกบัญชีซ้ำกัน'),
});

/** Today's votes and the name of the account each went to, deleted accounts included. */
function accountSelect(today: number) {
  return {
    id: true,
    accountName: true,
    accountUser: true,
    note: true,
    score: true,
    votes: {
      where: { voteDay: today },
      orderBy: { id: 'asc' },
      select: {
        voteAccountId: true,
        voteAccount: { select: { accountName: true, deletedAt: true } },
      },
    },
  } satisfies Prisma.JooxAccountSelect;
}

type Row = Prisma.JooxAccountGetPayload<{ select: ReturnType<typeof accountSelect> }>;

function toPublic(row: Row): JooxAccount {
  return {
    id: row.id,
    accountName: row.accountName,
    accountUser: row.accountUser,
    note: row.note,
    score: row.score,
    votes: row.votes.map((v) => ({
      voteAccountId: v.voteAccountId,
      accountName: v.voteAccount.accountName,
      removed: v.voteAccount.deletedAt !== null,
    })),
  };
}

function gone(): AppError {
  return new AppError(404, 'ไม่พบบัญชีนี้ อาจถูกลบไปแล้ว', 'NOT_FOUND');
}

function duplicate(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

const DUPLICATE_MESSAGE = 'มีบัญชีที่ใช้อีเมลหรือเบอร์โทรนี้อยู่แล้ว';

router.get(
  '/joox-accounts',
  asyncHandler(async (req, res) => {
    const rows = await prisma.jooxAccount.findMany({
      where: { voterId: req.jooxVoter!.id },
      orderBy: { id: 'asc' },
      select: accountSelect(jooxVoteDay()),
    });
    ok(res, rows.map(toPublic));
  }),
);

router.post(
  '/joox-accounts',
  jooxVoteEditLimiter,
  validate({ body: accountSchema }),
  asyncHandler(async (req, res) => {
    const { accountName, accountUser, note, score } = req.body as z.infer<typeof accountSchema>;
    try {
      const row = await prisma.jooxAccount.create({
        data: {
          voterId: req.jooxVoter!.id,
          accountName,
          accountUser,
          note,
          score,
          userKey: jooxAccountUserKey(accountUser),
        },
        select: accountSelect(jooxVoteDay()),
      });
      created(res, toPublic(row), 'เพิ่มบัญชีแล้ว');
    } catch (err) {
      if (duplicate(err)) throw new ConflictError(DUPLICATE_MESSAGE);
      throw err;
    }
  }),
);

router.patch(
  '/joox-accounts/:id',
  jooxVoteEditLimiter,
  validate({ params: idParams, body: accountSchema }),
  asyncHandler(async (req, res) => {
    const { accountName, accountUser, note, score } = req.body as z.infer<typeof accountSchema>;
    const where = { id: Number(req.params.id), voterId: req.jooxVoter!.id, deletedAt: null };
    try {
      const { count } = await prisma.jooxAccount.updateMany({
        where,
        data: { accountName, accountUser, note, score, userKey: jooxAccountUserKey(accountUser) },
      });
      if (count === 0) throw gone();
    } catch (err) {
      if (duplicate(err)) throw new ConflictError(DUPLICATE_MESSAGE);
      throw err;
    }
    const row = await prisma.jooxAccount.findFirst({ where, select: accountSelect(jooxVoteDay()) });
    if (!row) throw gone();
    ok(res, toPublic(row), 'บันทึกแล้ว');
  }),
);

/**
 * The score on its own, for the box on the account's card.
 *
 * Its own route rather than the full PATCH above, because the card has only the score to send.
 * Putting the whole account back to change one number would re-key the login and take the
 * duplicate check with it, and would let a card left open in one tab overwrite a name edited
 * in another.
 */
router.patch(
  '/joox-accounts/:id/score',
  jooxVoteEditLimiter,
  validate({ params: idParams, body: scoreSchema }),
  asyncHandler(async (req, res) => {
    const { score } = req.body as z.infer<typeof scoreSchema>;
    const where = { id: Number(req.params.id), voterId: req.jooxVoter!.id, deletedAt: null };
    const { count } = await prisma.jooxAccount.updateMany({ where, data: { score } });
    if (count === 0) throw gone();
    const row = await prisma.jooxAccount.findFirst({ where, select: accountSelect(jooxVoteDay()) });
    if (!row) throw gone();
    ok(res, toPublic(row), 'บันทึกคะแนนแล้ว');
  }),
);

router.delete(
  '/joox-accounts/:id',
  jooxVoteEditLimiter,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    // Soft, and the login's key cleared so it can be added again.
    const { count } = await prisma.jooxAccount.updateMany({
      where: { id: Number(req.params.id), voterId: req.jooxVoter!.id, deletedAt: null },
      data: { deletedAt: new Date(), userKey: null },
    });
    if (count === 0) throw gone();
    ok(res, null, 'ลบบัญชีแล้ว');
  }),
);

/**
 * Today's votes, sent as the whole set rather than one at a time, so what is on screen when
 * "save" is tapped is exactly what is stored. The account row is locked for the duration: two
 * tabs saving at once must not add up to more than {@link JOOX_VOTES_PER_ACCOUNT} between them.
 *
 * A new vote must go to an account still on the shared list. One already recorded today stays
 * allowed after its account is deleted from the list — that vote was spent all the same.
 */
router.put(
  '/joox-accounts/:id/votes',
  jooxVoteLimiter,
  validate({ params: idParams, body: votesSchema }),
  asyncHandler(async (req, res) => {
    const { voteAccountIds } = req.body as z.infer<typeof votesSchema>;
    const accountId = Number(req.params.id);
    const voterId = req.jooxVoter!.id;
    const today = jooxVoteDay();

    const row = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM joox_accounts
        WHERE id = ${accountId} AND voter_id = ${voterId} AND deleted_at IS NULL
        FOR UPDATE`;
      if (locked.length === 0) throw gone();

      const current = await tx.jooxAccountVote.findMany({
        where: { accountId, voteDay: today },
        select: { voteAccountId: true },
      });
      const had = new Set(current.map((v) => v.voteAccountId));
      const added = voteAccountIds.filter((id) => !had.has(id));

      if (added.length > 0) {
        const live = await tx.jooxVoteAccount.count({
          where: { id: { in: added }, deletedAt: null },
        });
        if (live !== added.length) {
          throw new BadRequestError('มีบัญชีที่เลือกถูกลบออกจากรายการโหวตแล้ว กรุณาเลือกใหม่');
        }
      }

      await tx.jooxAccountVote.deleteMany({
        where: { accountId, voteDay: today, voteAccountId: { notIn: voteAccountIds } },
      });
      await tx.jooxAccountVote.createMany({
        data: added.map((voteAccountId) => ({ accountId, voteAccountId, voteDay: today })),
        skipDuplicates: true,
      });

      return tx.jooxAccount.findFirst({
        where: { id: accountId },
        select: accountSelect(today),
      });
    });

    if (!row) throw gone();
    ok(res, toPublic(row), 'บันทึกการโหวตแล้ว');
  }),
);

export const publicJooxAccountsModule: FeatureModule = {
  name: 'public-joox-accounts',
  basePath: '/public',
  router,
};
