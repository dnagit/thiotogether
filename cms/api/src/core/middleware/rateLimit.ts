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

/**
 * Account-name lookups reveal how many tokens a name holds, so an unthrottled
 * endpoint would let someone enumerate donor names and balances. Tighter than the
 * general limiter for exactly that reason.
 */
export const accountLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'ตรวจสอบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
    code: 'RATE_LIMITED',
  },
});

/** Reservation attempts: generous enough for real play, hostile to scripted grabbing. */
export const reserveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'ส่งคำขอถี่เกินไป กรุณารอสักครู่',
    code: 'RATE_LIMITED',
  },
});

/** Limiter for public submissions (donations, forms) to deter spam. */
export const submissionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many submissions', code: 'RATE_LIMITED' },
});
