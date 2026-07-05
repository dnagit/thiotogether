import crypto from 'node:crypto';
import { prisma } from '../../core/database/prisma.js';
import { hashPassword, verifyPassword } from '../../core/utils/hash.js';
import {
  hashToken,
  refreshTokenExpiry,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../core/utils/jwt.js';
import { BadRequestError, UnauthorizedError } from '../../core/errors/AppError.js';
import { sendMail } from '../../core/mail/mailer.js';
import { config } from '../../core/config/index.js';
import type { AuthUser, LoginResponse, Permission } from '@cms/shared';

interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

export class AuthService {
  async login(email: string, password: string, meta: ClientMeta): Promise<LoginResponse & { refreshToken: string }> {
    const user = await prisma.user.findFirst({
      where: { email, isActive: true },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    // Same error for unknown email and wrong password — no user enumeration.
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const authUser = this.toAuthUser(user);
    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      role: authUser.role,
      permissions: authUser.permissions,
    });
    const refreshToken = signRefreshToken({ sub: user.id });

    await prisma.$transaction([
      prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(refreshToken),
          expiresAt: refreshTokenExpiry(),
          ip: meta.ip,
          userAgent: meta.userAgent?.slice(0, 255),
        },
      }),
      prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    ]);

    return { accessToken, refreshToken, user: authUser };
  }

  /** Rotate: verify JWT + DB record, revoke old, issue new pair. */
  async refresh(oldToken: string, meta: ClientMeta): Promise<{ accessToken: string; refreshToken: string }> {
    const { sub } = verifyRefreshToken(oldToken);
    const record = await prisma.refreshToken.findFirst({
      where: { tokenHash: hashToken(oldToken), revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!record || record.userId !== sub) {
      // Reuse of a revoked token is a theft signal — revoke the whole family.
      await prisma.refreshToken.updateMany({
        where: { userId: sub, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedError('Refresh token invalid — please log in again');
    }

    const user = await prisma.user.findFirst({
      where: { id: sub, isActive: true },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user) throw new UnauthorizedError('Account disabled');

    const authUser = this.toAuthUser(user);
    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      role: authUser.role,
      permissions: authUser.permissions,
    });
    const refreshToken = signRefreshToken({ sub: user.id });

    await prisma.$transaction([
      prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } }),
      prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(refreshToken),
          expiresAt: refreshTokenExpiry(),
          ip: meta.ip,
          userAgent: meta.userAgent?.slice(0, 255),
        },
      }),
    ]);

    return { accessToken, refreshToken };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: number): Promise<AuthUser> {
    const user = await prisma.user.findFirst({
      where: { id: userId, isActive: true },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user) throw new UnauthorizedError();
    return this.toAuthUser(user);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await prisma.user.findFirst({ where: { email, isActive: true } });
    // Always succeed from the caller's perspective — no user enumeration.
    if (!user) return;

    const token = crypto.randomBytes(32).toString('hex');
    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const link = `${config.ADMIN_URL}/reset-password?token=${token}`;
    await sendMail(
      user.email,
      'Reset your password',
      `<p>Hi ${user.name},</p><p>Click <a href="${link}">here</a> to reset your password. The link expires in 1 hour.</p>`,
    );
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const record = await prisma.passwordReset.findFirst({
      where: { tokenHash: hashToken(token), usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!record) throw new BadRequestError('Reset link is invalid or expired');

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: await hashPassword(password) },
      }),
      prisma.passwordReset.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // Password change invalidates every session.
      prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findFirst({ where: { id: userId } });
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new BadRequestError('Current password is incorrect');
    }
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await hashPassword(newPassword) },
      }),
      prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private toAuthUser(user: {
    id: number;
    email: string;
    name: string;
    avatarUrl: string | null;
    role: { name: string; permissions: Array<{ permission: { name: string } }> };
  }): AuthUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role.name,
      permissions: user.role.permissions.map((p) => p.permission.name as Permission),
    };
  }
}

export const authService = new AuthService();
