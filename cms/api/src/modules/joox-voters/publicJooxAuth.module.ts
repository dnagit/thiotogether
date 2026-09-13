import { z } from 'zod';
import { Router } from 'express';
import { prisma } from '../../core/database/prisma.js';
import { validate } from '../../core/middleware/validate.js';
import { jooxLoginLimiter } from '../../core/middleware/rateLimit.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { hashToken } from '../../core/utils/jwt.js';
import { verifyPassword } from '../../core/utils/hash.js';
import { ok } from '../../core/base/BaseController.js';
import { AppError } from '../../core/errors/AppError.js';
import {
  createJooxSession,
  normalizeJooxUsername,
  requireJooxVoter,
  toPublicVoter,
  voterSelect,
} from './jooxVoterAuth.js';
import type { FeatureModule } from '../../core/modules.js';

/**
 * Signing in to the JOOX checklist: what the website calls at `/joox-vote/login`.
 *
 *   POST /public/joox/login  → { token, expiresAt, voter }
 *   POST /public/joox/logout → the token used is destroyed
 *   GET  /public/joox/me     → the voter the token belongs to
 *
 * There is no sign-up and no password reset by design — accounts are created in the admin
 * and the password an admin generated is the only way in. See `jooxVoters.module.ts`.
 */

const router = Router();

const loginSchema = z.object({
  username: z.string().trim().min(1, 'กรุณากรอกชื่อผู้ใช้').max(50, 'ชื่อผู้ใช้ยาวเกินไป'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน').max(200),
});

router.post(
  '/joox/login',
  jooxLoginLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { username, password } = req.body as z.infer<typeof loginSchema>;

    const voter = await prisma.jooxVoter.findFirst({
      where: { username: normalizeJooxUsername(username), deletedAt: null },
      select: { ...voterSelect, passwordHash: true },
    });

    /*
     * One message for an unknown username, a wrong password and a switched-off account
     * alike. Anything more specific would let someone work out which usernames exist, and
     * a voter shut out on purpose is a thing for the admin to explain, not the login page.
     */
    if (!voter || !voter.isActive || !(await verifyPassword(password, voter.passwordHash))) {
      throw new AppError(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 'JOOX_LOGIN_FAILED');
    }

    const { token, expiresAt } = await createJooxSession(voter.id);
    await prisma.jooxVoter.update({
      where: { id: voter.id },
      data: { lastLoginAt: new Date() },
    });

    ok(res, {
      token,
      expiresAt: expiresAt.toISOString(),
      voter: toPublicVoter(voter),
    });
  }),
);

/** This phone only. Other phones signed in as the same voter stay signed in. */
router.post(
  '/joox/logout',
  requireJooxVoter,
  asyncHandler(async (req, res) => {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      await prisma.jooxVoterSession.deleteMany({ where: { tokenHash: hashToken(header.slice(7)) } });
    }
    ok(res, null, 'ออกจากระบบแล้ว');
  }),
);

/**
 * Whether the stored token still works, and who it belongs to. The website asks on load, so
 * a token an admin has since revoked sends the phone to the login page instead of letting it
 * onto a checklist whose every tap would fail.
 */
router.get(
  '/joox/me',
  requireJooxVoter,
  asyncHandler(async (req, res) => {
    const voter = await prisma.jooxVoter.findUnique({
      where: { id: req.jooxVoter!.id },
      select: voterSelect,
    });
    ok(res, voter ? toPublicVoter(voter) : null);
  }),
);

export const publicJooxAuthModule: FeatureModule = {
  name: 'public-joox-auth',
  basePath: '/public',
  router,
};
