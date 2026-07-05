import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../utils/jwt.js';
import { UnauthorizedError } from '../errors/AppError.js';
import type { JwtPayload } from '@cms/shared';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: JwtPayload;
    }
  }
}

/** Require a valid Bearer access token; attaches payload to req.auth. */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new UnauthorizedError());
    return;
  }
  req.auth = verifyAccessToken(header.slice(7));
  next();
}

/** Attach auth if present, but never fail — for public endpoints with optional user context. */
export function authenticateOptional(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      req.auth = verifyAccessToken(header.slice(7));
    } catch {
      // ignore invalid token on optional routes
    }
  }
  next();
}
