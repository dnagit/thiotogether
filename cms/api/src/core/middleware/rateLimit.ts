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

/**
 * JOOX checklist taps — a vote link opened, an account marked done. Loose, because a fan
 * works through account after account, and on mobile data many of them share one IP.
 */
export const jooxVoteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'กดถี่เกินไป กรุณารอสักครู่', code: 'RATE_LIMITED' },
});

/**
 * JOOX voter logins. Usernames are handed out by an admin and their passwords are ten
 * random characters, so this is what stands between the login and someone working through
 * the guesses. Successful logins don't count: a household or a school sharing one IP can
 * sign in all evening, and only the failures are throttled.
 */
export const jooxLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่',
    code: 'RATE_LIMITED',
  },
});

/**
 * Adding and deleting JOOX checklist accounts. One shared list that every signed-in voter
 * can edit, so this is what stands between it and one of them emptying it or flooding it.
 */
export const jooxVoteEditLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'เพิ่มหรือลบบัญชีถี่เกินไป กรุณารอสักครู่',
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

/**
 * Sowing in the sunflower garden. Looser than `submissionLimiter`: one person sowing for a
 * whole family is expected, and at an event many phones share one IP.
 */
export const gardenSowLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'ปลูกถี่เกินไป กรุณารอสักครู่แล้วลองใหม่', code: 'RATE_LIMITED' },
});

/**
 * Food-trail checklist saves and loads. A fan ticks dish after dish (the page batches the
 * ticks, but still), and on mobile data many fans share one IP — so loose, like the JOOX one.
 */
export const foodTrailLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'บันทึกถี่เกินไป กรุณารอสักครู่', code: 'RATE_LIMITED' },
});
