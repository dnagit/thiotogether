import { Router } from 'express';
import { authController } from './auth.controller.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from './auth.validation.js';
import { validate } from '../../core/middleware/validate.js';
import { authenticate } from '../../core/middleware/authenticate.js';
import { authLimiter } from '../../core/middleware/rateLimit.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import type { FeatureModule } from '../../core/modules.js';

const router = Router();

router.post('/login', authLimiter, validate({ body: loginSchema }), asyncHandler(authController.login));
router.post('/refresh', asyncHandler(authController.refresh));
router.post('/logout', asyncHandler(authController.logout));
router.get('/me', authenticate, asyncHandler(authController.me));
router.post(
  '/forgot-password',
  authLimiter,
  validate({ body: forgotPasswordSchema }),
  asyncHandler(authController.forgotPassword),
);
router.post(
  '/reset-password',
  authLimiter,
  validate({ body: resetPasswordSchema }),
  asyncHandler(authController.resetPassword),
);
router.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  asyncHandler(authController.changePassword),
);

export const authModule: FeatureModule = {
  name: 'auth',
  basePath: '/auth',
  router,
};
