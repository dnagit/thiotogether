import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';

/** General API limiter. */
export const apiLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests', code: 'RATE_LIMITED' },
});

/** Stricter limiter for credential endpoints (login, forgot password). */
export const authLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many attempts, try again later', code: 'RATE_LIMITED' },
});

/** Limiter for public submissions (donations, forms) to deter spam. */
export const submissionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many submissions', code: 'RATE_LIMITED' },
});
