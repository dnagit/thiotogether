import crypto from 'node:crypto';
import type { Request } from 'express';
import { prisma } from '../../core/database/prisma.js';
import { hashToken } from '../../core/utils/jwt.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { AppError } from '../../core/errors/AppError.js';
import type { JooxVoter } from '@cms/shared';

/**
 * The login behind `/joox-vote`, shared by the public routes the website calls and the admin
 * routes that hand the accounts out.
 *
 * A session is an opaque random token, not a JWT. The point of a JWT is to be checked without
 * touching the database, and that is exactly the wrong trade here: an admin who switches a
 * voter off, resets a password or deletes an account expects the phone holding it to be shut
 * out now, not in fifteen minutes. Every request looks the session up, so every one of those
 * takes effect on the next tap. The token is stored hashed, the same way refresh tokens are —
 * a leak of the table hands out nothing anyone can sign in with.
 */

/** Long, because a voter is handed the password once and comes back to the page daily. */
export const JOOX_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by {@link requireJooxVoter}. Never carries a role or a permission — see below. */
      jooxVoter?: { id: number; username: string; displayName: string | null };
    }
  }
}

const voterSelect = {
  id: true,
  username: true,
  displayName: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

interface VoterRow {
  id: number;
  username: string;
  displayName: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt?: Date;
}

export { voterSelect };

/** What leaves the API. The password hash is never in the select, so it cannot slip out. */
export function toPublicVoter(row: VoterRow): JooxVoter {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt?.toISOString(),
  };
}

/**
 * Usernames are stored and matched lowercased: they are typed on a phone, where the keyboard
 * capitalises the first letter by itself, and "Fern" failing to sign in an account created as
 * "fern" would be nobody's idea of a wrong password. Applied on create and on login alike, so
 * the unique index also stops two voters differing only in case.
 */
export function normalizeJooxUsername(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * Read off a screen — often a screenshot in a group chat — and typed into a phone, so the
 * alphabet leaves out every pair that looks alike: no O/0, no I/l/1. `randomInt` rather than
 * `randomBytes % length`, which would make the first characters of the alphabet likelier.
 */
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function generateJooxPassword(length = 10): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += PASSWORD_ALPHABET[crypto.randomInt(PASSWORD_ALPHABET.length)];
  }
  return out;
}

export async function createJooxSession(
  voterId: number,
): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + JOOX_SESSION_TTL_MS);
  await prisma.jooxVoterSession.create({
    data: { voterId, tokenHash: hashToken(token), expiresAt },
  });
  // Expired rows of this voter's, cleared as we go — there is no scheduled job to do it.
  await prisma.jooxVoterSession.deleteMany({
    where: { voterId, expiresAt: { lt: new Date() } },
  });
  return { token, expiresAt };
}

/** Every phone signed in as this voter is signed out: password changed, disabled, deleted. */
export function revokeJooxSessions(voterId: number): Promise<unknown> {
  return prisma.jooxVoterSession.deleteMany({ where: { voterId } });
}

/**
 * The token off a request. `EventSource` cannot set headers, so the live feed — and only it —
 * has nowhere to put the token but the query string; the header is what everything else uses.
 */
function tokenFrom(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const fromQuery = req.query.token;
  return typeof fromQuery === 'string' && fromQuery ? fromQuery : null;
}

/**
 * A distinct code from the admin's `UNAUTHORIZED`: the website watches for it to clear the
 * stored token and send the phone to the login page, and must not do that for anything else.
 */
export function jooxAuthRequired(): AppError {
  return new AppError(401, 'กรุณาเข้าสู่ระบบก่อนใช้งาน', 'JOOX_AUTH_REQUIRED');
}

/** Guards every JOOX route. Without it the checklist is open to the whole internet. */
export const requireJooxVoter = asyncHandler(async (req, _res, next) => {
  const token = tokenFrom(req);
  if (!token) {
    next(jooxAuthRequired());
    return;
  }

  const session = await prisma.jooxVoterSession.findFirst({
    where: { tokenHash: hashToken(token), expiresAt: { gt: new Date() } },
    select: { voter: { select: { id: true, username: true, displayName: true, isActive: true, deletedAt: true } } },
  });
  // Disabled and deleted are checked here rather than at login, so an admin switching a
  // voter off shuts out the phones already holding a token, on their very next request.
  if (!session || !session.voter.isActive || session.voter.deletedAt) {
    next(jooxAuthRequired());
    return;
  }

  const { id, username, displayName } = session.voter;
  req.jooxVoter = { id, username, displayName };
  next();
});
