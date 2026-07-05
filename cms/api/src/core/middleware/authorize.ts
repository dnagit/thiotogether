import type { NextFunction, Request, Response } from 'express';
import { ForbiddenError, UnauthorizedError } from '../errors/AppError.js';
import { RoleName, type Permission } from '@cms/shared';

/**
 * Permission-based guard. SUPER_ADMIN bypasses individual checks.
 * Usage: router.post('/', authenticate, authorize(PERMISSIONS.PAGES_CREATE), handler)
 */
export function authorize(...required: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new UnauthorizedError());
      return;
    }
    if (req.auth.role === RoleName.SUPER_ADMIN) {
      next();
      return;
    }
    const granted = new Set(req.auth.permissions ?? []);
    const missing = required.filter((p) => !granted.has(p));
    if (missing.length > 0) {
      next(new ForbiddenError(`Missing permission: ${missing.join(', ')}`));
      return;
    }
    next();
  };
}
