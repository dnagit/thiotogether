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
 *   PATCH  /public/joox-accounts/:id/score  → { score?, scoreDone? }, for the card's own box
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
 *
 * The score an account carries is on that same clock, and by the checklist's method rather
 * than the votes': one column for the number, one for the tick, and one for the day the two
 * belong to. {@link toPublic} reports a day gone by as 0 and false, and {@link writeScore}
 * starts the day over in the same UPDATE that writes to it — so nothing has to run at 23:00,
 * and a server restarted across it cannot miss the reset.
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
const scoreField = z.coerce
  .number()
  .int('คะแนนต้องเป็นจำนวนเต็ม')
  .min(0, 'คะแนนต้องไม่ติดลบ')
  .max(SCORE_MAX, 'คะแนนสูงเกินไป');

const scoreShape = { score: scoreField.default(0) };

/**
 * The card's own box, which sends whichever of the two it changed.
 *
 * Both optional and neither implied: the tick and the number sit next to each other on the
 * card but are tapped separately, and a request carrying only one must leave the other where
 * it is. Sending neither is the one thing that is not a request at all.
 */
const scorePatchSchema = z
  .object({
    score: scoreField.optional(),
    // Plain, not coerced: the page sends a JSON boolean, and `z.coerce.boolean()` would read
    // the string "false" as true — the one wrong answer a tick can give.
    scoreDone: z.boolean().optional(),
  })
  .refine(
    (body) => body.score !== undefined || body.scoreDone !== undefined,
    'ไม่มีอะไรให้บันทึก',
  );

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
    scoreDone: true,
    scoreDay: true,
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

/** What leaves the API: today's score, or zero for a row not written to since the last reset. */
function toPublic(row: Row, today: number): JooxAccount {
  const current = row.scoreDay >= today;
  return {
    id: row.id,
    accountName: row.accountName,
    accountUser: row.accountUser,
    note: row.note,
    score: current ? row.score : 0,
    scoreDone: current ? row.scoreDone : false,
    votes: row.votes.map((v) => ({
      voteAccountId: v.voteAccountId,
      accountName: v.voteAccount.accountName,
      removed: v.voteAccount.deletedAt !== null,
    })),
  };
}

/**
 * Writes whichever of the score and the tick was sent, and starts the day over if it has.
 *
 * Raw, and in one statement, because the reset has to happen in the same write: a tick
 * arriving on a stale row must not inherit yesterday's number, and reading the day first and
 * deciding in JavaScript would leave a gap across 23:00 for it to do exactly that.
 *
 * `COALESCE` is what makes it a patch — a parameter that was sent wins, and one that was not
 * falls through to today's stored value, or to nothing at all when the day has turned. The
 * casts are needed because both parameters can be null, which Postgres cannot type on its own.
 *
 * Scoped by `voterId` like every other query here, so somebody else's id writes nothing and
 * is answered as a row that does not exist.
 */
async function writeScore(
  id: number,
  voterId: number,
  patch: { score?: number; scoreDone?: boolean },
  today: number,
): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ id: number }>>`
    UPDATE joox_accounts
    SET score      = COALESCE(${patch.score ?? null}::int,
                              CASE WHEN score_day >= ${today} THEN score ELSE 0 END),
        score_done = COALESCE(${patch.scoreDone ?? null}::boolean,
                              CASE WHEN score_day >= ${today} THEN score_done ELSE false END),
        score_day  = GREATEST(score_day, ${today}),
        updated_at = NOW() AT TIME ZONE 'UTC'
    WHERE id = ${id} AND voter_id = ${voterId} AND deleted_at IS NULL
    RETURNING id`;
  return rows.length;
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
    const today = jooxVoteDay();
    const rows = await prisma.jooxAccount.findMany({
      where: { voterId: req.jooxVoter!.id },
      orderBy: { id: 'asc' },
      select: accountSelect(today),
    });
    ok(
      res,
      rows.map((row) => toPublic(row, today)),
    );
  }),
);

router.post(
  '/joox-accounts',
  jooxVoteEditLimiter,
  validate({ body: accountSchema }),
  asyncHandler(async (req, res) => {
    const { accountName, accountUser, note, score } = req.body as z.infer<typeof accountSchema>;
    const today = jooxVoteDay();
    try {
      const row = await prisma.jooxAccount.create({
        data: {
          voterId: req.jooxVoter!.id,
          accountName,
          accountUser,
          note,
          // A row written now is today's, so there is no stale day for the score to inherit.
          score,
          scoreDay: today,
          userKey: jooxAccountUserKey(accountUser),
        },
        select: accountSelect(today),
      });
      created(res, toPublic(row, today), 'เพิ่มบัญชีแล้ว');
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
    const id = Number(req.params.id);
    const voterId = req.jooxVoter!.id;
    const where = { id, voterId, deletedAt: null };
    const today = jooxVoteDay();
    try {
      const { count } = await prisma.jooxAccount.updateMany({
        where,
        data: { accountName, accountUser, note, userKey: jooxAccountUserKey(accountUser) },
      });
      if (count === 0) throw gone();
    } catch (err) {
      if (duplicate(err)) throw new ConflictError(DUPLICATE_MESSAGE);
      throw err;
    }
    // The score goes through the same statement as the card's box, so the form cannot be the
    // one path that writes a number without moving the day on with it. The tick is left alone:
    // it is the card's, and a form that does not show it must not turn it off.
    if ((await writeScore(id, voterId, { score }, today)) === 0) throw gone();

    const row = await prisma.jooxAccount.findFirst({ where, select: accountSelect(today) });
    if (!row) throw gone();
    ok(res, toPublic(row, today), 'บันทึกแล้ว');
  }),
);

/**
 * Today's score, the tick, or both — whatever the card changed.
 *
 * Its own route rather than the full PATCH above, because the card has only these to send.
 * Putting the whole account back to change one number would re-key the login and take the
 * duplicate check with it, and would let a card left open in one tab overwrite a name edited
 * in another.
 */
router.patch(
  '/joox-accounts/:id/score',
  jooxVoteEditLimiter,
  validate({ params: idParams, body: scorePatchSchema }),
  asyncHandler(async (req, res) => {
    const patch = req.body as z.infer<typeof scorePatchSchema>;
    const id = Number(req.params.id);
    const voterId = req.jooxVoter!.id;
    const today = jooxVoteDay();

    if ((await writeScore(id, voterId, patch, today)) === 0) throw gone();
    const row = await prisma.jooxAccount.findFirst({
      where: { id, voterId, deletedAt: null },
      select: accountSelect(today),
    });
    if (!row) throw gone();
    ok(res, toPublic(row, today), patch.score === undefined ? 'บันทึกแล้ว' : 'บันทึกคะแนนแล้ว');
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
    ok(res, toPublic(row, today), 'บันทึกการโหวตแล้ว');
  }),
);

export const publicJooxAccountsModule: FeatureModule = {
  name: 'public-joox-accounts',
  basePath: '/public',
  router,
};
