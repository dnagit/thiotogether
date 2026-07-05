import type { NextFunction, Request, Response } from 'express';
import type { AnyZodObject, ZodEffects, ZodTypeAny } from 'zod';

type Schema = AnyZodObject | ZodEffects<ZodTypeAny>;

interface ValidateSchemas {
  body?: Schema;
  query?: Schema;
  params?: Schema;
}

/**
 * Zod-based request validation. Parsed (and coerced) values replace the raw ones,
 * so downstream code always sees typed input. Throwing ZodError is handled by the
 * global error handler and mapped to 422 with field errors.
 */
export function validate(schemas: ValidateSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) Object.assign(req.query, schemas.query.parse(req.query));
      if (schemas.params) Object.assign(req.params, schemas.params.parse(req.params));
      next();
    } catch (err) {
      next(err);
    }
  };
}
