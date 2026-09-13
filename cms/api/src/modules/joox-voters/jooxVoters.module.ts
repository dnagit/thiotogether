import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../../core/database/prisma.js';
import { authenticate } from '../../core/middleware/authenticate.js';
import { authorize } from '../../core/middleware/authorize.js';
import { audit } from '../../core/middleware/audit.js';
import { validate } from '../../core/middleware/validate.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { parseListQuery, paginationMeta } from '../../core/utils/pagination.js';
import { hashPassword } from '../../core/utils/hash.js';
import { ok, created } from '../../core/base/BaseController.js';
import { ConflictError, NotFoundError } from '../../core/errors/AppError.js';
import { PERMISSIONS } from '@cms/shared';
import {
  generateJooxPassword,
  normalizeJooxUsername,
  revokeJooxSessions,
  toPublicVoter,
  voterSelect,
} from './jooxVoterAuth.js';
import type { FeatureModule } from '../../core/modules.js';

/**
 * Handing out the logins for `/joox-vote`, from the admin.
 *
 *   GET    /joox-voters              → the accounts, paginated and searchable
 *   POST   /joox-voters              → create; answers with the generated password, once
 *   PUT    /joox-voters/:id          → rename, or switch the account off
 *   POST   /joox-voters/:id/password → generate a new one; every phone is signed out
 *   DELETE /joox-voters/:id          → soft delete; every phone is signed out
 *
 * An admin never types a password and never sees an old one: the API generates it and
 * returns the plaintext exactly once, in the response to the call that made it. What is
 * stored is a bcrypt hash, so a password nobody wrote down is not recoverable — it is
 * replaced. That is the whole reason the two password endpoints exist.
 */

const router = Router();

router.use(authenticate, audit('joox-voters'));

/**
 * Letters, digits, dot, dash and underscore: a username is read aloud across a room and
 * typed on a phone keyboard, and anything else invites a space nobody can see.
 */
const usernameSchema = z
  .string()
  .trim()
  .min(3, 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร')
  .max(50, 'ชื่อผู้ใช้ยาวเกินไป')
  .regex(/^[a-zA-Z0-9._-]+$/, 'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - เท่านั้น');

const createSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().max(100, 'ชื่อที่แสดงยาวเกินไป').nullish(),
});

const updateSchema = z.object({
  displayName: z.string().trim().max(100, 'ชื่อที่แสดงยาวเกินไป').nullish(),
  isActive: z.boolean().optional(),
});

const idParams = z.object({ id: z.coerce.number().int().positive() });

/** `?sortBy=` reaches Prisma as a column name, so only these are allowed through. */
const SORTABLE = new Set(['createdAt', 'username', 'displayName', 'lastLoginAt', 'isActive']);

/** The row as it now stands — used by every endpoint below that answers with a voter. */
async function findVoter(id: number) {
  const voter = await prisma.jooxVoter.findFirst({
    where: { id, deletedAt: null },
    select: voterSelect,
  });
  if (!voter) throw new NotFoundError('Voter');
  return voter;
}

router.get(
  '/',
  authorize(PERMISSIONS.JOOX_VOTERS_VIEW),
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const where: Prisma.JooxVoterWhereInput = {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { username: { contains: query.search, mode: 'insensitive' as const } },
              { displayName: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(query.filters.isActive ? { isActive: query.filters.isActive === 'true' } : {}),
    };

    const [rows, total] = await prisma.$transaction([
      prisma.jooxVoter.findMany({
        where,
        select: voterSelect,
        orderBy: {
          [query.sortBy && SORTABLE.has(query.sortBy) ? query.sortBy : 'createdAt']:
            query.sortOrder,
        },
        skip: query.skip,
        take: query.take,
      }),
      prisma.jooxVoter.count({ where }),
    ]);

    ok(res, rows.map(toPublicVoter), undefined, paginationMeta(query.page, query.limit, total));
  }),
);

router.post(
  '/',
  authorize(PERMISSIONS.JOOX_VOTERS_MANAGE),
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const { username, displayName } = req.body as z.infer<typeof createSchema>;
    const password = generateJooxPassword();

    try {
      const voter = await prisma.jooxVoter.create({
        data: {
          username: normalizeJooxUsername(username),
          passwordHash: await hashPassword(password),
          displayName: displayName || null,
        },
        select: voterSelect,
      });
      created(res, { voter: toPublicVoter(voter), password }, 'สร้างบัญชีแล้ว');
    } catch (err) {
      // The unique index settles a race two admins couldn't; the message is for the loser.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('ชื่อผู้ใช้นี้ถูกใช้แล้ว');
      }
      throw err;
    }
  }),
);

router.put(
  '/:id(\\d+)',
  authorize(PERMISSIONS.JOOX_VOTERS_MANAGE),
  validate({ params: idParams, body: updateSchema }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { displayName, isActive } = req.body as z.infer<typeof updateSchema>;
    await findVoter(id);

    const voter = await prisma.jooxVoter.update({
      where: { id },
      data: {
        ...(displayName === undefined ? {} : { displayName: displayName || null }),
        ...(isActive === undefined ? {} : { isActive }),
      },
      select: voterSelect,
    });
    // Switched off means off now, not when the token expires.
    if (isActive === false) await revokeJooxSessions(id);

    ok(res, toPublicVoter(voter), 'บันทึกแล้ว');
  }),
);

/**
 * A new password. The old one stops working the moment this returns, and so do the phones
 * already signed in with it — which is what an admin doing this usually wants, whether the
 * password went to the wrong group chat or was simply lost.
 */
router.post(
  '/:id(\\d+)/password',
  authorize(PERMISSIONS.JOOX_VOTERS_MANAGE),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await findVoter(id);
    const password = generateJooxPassword();

    const voter = await prisma.jooxVoter.update({
      where: { id },
      data: { passwordHash: await hashPassword(password) },
      select: voterSelect,
    });
    await revokeJooxSessions(id);

    ok(res, { voter: toPublicVoter(voter), password }, 'สร้างรหัสผ่านใหม่แล้ว');
  }),
);

router.delete(
  '/:id(\\d+)',
  authorize(PERMISSIONS.JOOX_VOTERS_MANAGE),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await findVoter(id);
    /*
     * Soft, like every other table — but the username is freed as it goes, so the same
     * person can be given their name back later. A deleted row keeps no password worth
     * restoring anyway: coming back means a new account and a new generated password.
     */
    await prisma.jooxVoter.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, username: `deleted:${id}:${Date.now()}` },
    });
    await revokeJooxSessions(id);

    ok(res, null, 'ลบบัญชีแล้ว');
  }),
);

export const jooxVotersModule: FeatureModule = {
  name: 'joox-voters',
  basePath: '/joox-voters',
  router,
};
