import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../database/prisma.js';
import { logger } from '../logger.js';

/**
 * Write an audit log entry after a successful mutating request.
 * Mounted per-router: audit('pages') logs create/update/delete on that resource.
 * Fire-and-forget — auditing must never fail a business request.
 */
export function audit(resource: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      next();
      return;
    }
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      const action =
        req.method === 'POST' ? 'create' : req.method === 'DELETE' ? 'delete' : 'update';
      prisma.auditLog
        .create({
          data: {
            userId: req.auth ? Number(req.auth.sub) : null,
            action,
            resource,
            resourceId: req.params.id ?? null,
            detail: sanitizeBody(req.body),
            ip: req.ip,
          },
        })
        .catch((err: unknown) => logger.warn({ err }, 'audit log write failed'));
    });
    next();
  };
}

const SENSITIVE = /password|token|secret/i;

function sanitizeBody(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    out[k] = SENSITIVE.test(k) ? '[redacted]' : v;
  }
  return out;
}
