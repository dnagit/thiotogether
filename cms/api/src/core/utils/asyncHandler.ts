import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Wrap an async route handler so rejections reach the global error handler. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
