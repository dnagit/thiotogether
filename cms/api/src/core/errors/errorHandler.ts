import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from './AppError.js';
import { logger } from '../logger.js';
import { config } from '../config/index.js';
import type { ApiErrorResponse } from '@cms/shared';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    code: 'NOT_FOUND',
  } satisfies ApiErrorResponse);
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code,
      errors: err.errors,
    } satisfies ApiErrorResponse);
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      errors: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
    } satisfies ApiErrorResponse);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        success: false,
        message: 'A record with this value already exists',
        code: 'CONFLICT',
      } satisfies ApiErrorResponse);
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        message: 'Record not found',
        code: 'NOT_FOUND',
      } satisfies ApiErrorResponse);
      return;
    }
  }

  logger.error({ err, url: req.url, method: req.method }, 'Unhandled error');
  res.status(500).json({
    success: false,
    message: config.isProd ? 'Internal server error' : String((err as Error)?.message ?? err),
    code: 'INTERNAL_ERROR',
  } satisfies ApiErrorResponse);
}
