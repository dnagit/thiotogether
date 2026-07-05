import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { UnauthorizedError } from '../errors/AppError.js';
import type { JwtPayload } from '@cms/shared';

export function signAccessToken(payload: Omit<JwtPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'access' }, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_ACCESS_TTL,
  } as jwt.SignOptions);
}

export function signRefreshToken(payload: Pick<JwtPayload, 'sub'>): string {
  return jwt.sign({ sub: payload.sub, type: 'refresh' }, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_TTL,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as unknown as JwtPayload;
    if (payload.type !== 'access') throw new Error('wrong type');
    return payload;
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }
}

export function verifyRefreshToken(token: string): { sub: number } {
  try {
    const payload = jwt.verify(token, config.JWT_REFRESH_SECRET) as unknown as JwtPayload;
    if (payload.type !== 'refresh') throw new Error('wrong type');
    return { sub: Number(payload.sub) };
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }
}

/** Refresh tokens are stored hashed — a DB leak must not leak usable tokens. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshTokenExpiry(): Date {
  const ttl = config.JWT_REFRESH_TTL;
  const match = /^(\d+)([smhd])$/.exec(ttl);
  const ms = match
    ? Number(match[1]) * { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[match[2] as 's' | 'm' | 'h' | 'd']
    : 30 * 864e5;
  return new Date(Date.now() + ms);
}
