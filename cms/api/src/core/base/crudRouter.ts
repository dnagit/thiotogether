import { Router } from 'express';
import type { AnyZodObject } from 'zod';
import type { BaseController } from './BaseController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { audit } from '../middleware/audit.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { Permission } from '@cms/shared';

export interface CrudRouterOptions {
  controller: BaseController<any, any, any>;
  resource: string;
  permissions: {
    view: Permission;
    create: Permission;
    update: Permission;
    delete: Permission;
  };
  createSchema?: AnyZodObject;
  updateSchema?: AnyZodObject;
}

/**
 * Standard authenticated CRUD router. Modules with extra endpoints add them on
 * the returned router before/after — extension without core modification.
 */
export function crudRouter(options: CrudRouterOptions): Router {
  const { controller, resource, permissions, createSchema, updateSchema } = options;
  const router = Router();

  router.use(authenticate, audit(resource));

  router.get('/', authorize(permissions.view), asyncHandler(controller.list));
  router.get('/:id(\\d+)', authorize(permissions.view), asyncHandler(controller.getById));
  router.post(
    '/',
    authorize(permissions.create),
    ...(createSchema ? [validate({ body: createSchema })] : []),
    asyncHandler(controller.create),
  );
  router.put(
    '/:id(\\d+)',
    authorize(permissions.update),
    ...(updateSchema ? [validate({ body: updateSchema })] : []),
    asyncHandler(controller.update),
  );
  router.delete('/:id(\\d+)', authorize(permissions.delete), asyncHandler(controller.remove));

  return router;
}
