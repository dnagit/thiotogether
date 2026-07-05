import type { Request, Response } from 'express';
import { authService } from './auth.service.js';
import { ok } from '../../core/base/BaseController.js';
import { config } from '../../core/config/index.js';

const REFRESH_COOKIE = 'cms_refresh';

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: config.isProd ? 'strict' : 'lax',
    path: '/api/v1/auth',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export class AuthController {
  login = async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body;
    const { accessToken, refreshToken, user } = await authService.login(email, password, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    setRefreshCookie(res, refreshToken);
    ok(res, { accessToken, user }, 'Logged in');
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    const { accessToken, refreshToken } = await authService.refresh(
      req.cookies?.[REFRESH_COOKIE] ?? '',
      { ip: req.ip, userAgent: req.headers['user-agent'] },
    );
    setRefreshCookie(res, refreshToken);
    ok(res, { accessToken });
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    await authService.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    ok(res, null, 'Logged out');
  };

  me = async (req: Request, res: Response): Promise<void> => {
    ok(res, await authService.me(Number(req.auth!.sub)));
  };

  forgotPassword = async (req: Request, res: Response): Promise<void> => {
    await authService.forgotPassword(req.body.email);
    ok(res, null, 'If the email exists, a reset link has been sent');
  };

  resetPassword = async (req: Request, res: Response): Promise<void> => {
    await authService.resetPassword(req.body.token, req.body.password);
    ok(res, null, 'Password has been reset');
  };

  changePassword = async (req: Request, res: Response): Promise<void> => {
    await authService.changePassword(
      Number(req.auth!.sub),
      req.body.currentPassword,
      req.body.newPassword,
    );
    ok(res, null, 'Password changed');
  };
}

export const authController = new AuthController();
