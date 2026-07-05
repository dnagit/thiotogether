import { Router } from 'express';
import { BaseController, ok, created } from '../../core/base/BaseController.js';
import { crudRouter } from '../../core/base/crudRouter.js';
import { pageService, PageService } from './pages.service.js';
import { createPageSchema, updatePageSchema, saveBlocksSchema } from './pages.validation.js';
import { validate } from '../../core/middleware/validate.js';
import { authorize } from '../../core/middleware/authorize.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { PERMISSIONS } from '@cms/shared';
import type { FeatureModule } from '../../core/modules.js';

class PageController extends BaseController<any> {
  protected service: PageService = pageService;
}

const controller = new PageController();

const router: Router = crudRouter({
  controller,
  resource: 'pages',
  permissions: {
    view: PERMISSIONS.PAGES_VIEW,
    create: PERMISSIONS.PAGES_CREATE,
    update: PERMISSIONS.PAGES_UPDATE,
    delete: PERMISSIONS.PAGES_DELETE,
  },
  createSchema: createPageSchema,
  updateSchema: updatePageSchema,
});

router.get(
  '/tree',
  authorize(PERMISSIONS.PAGES_VIEW),
  asyncHandler(async (_req, res) => ok(res, await pageService.getTree())),
);

router.get(
  '/:id(\\d+)/blocks',
  authorize(PERMISSIONS.PAGES_VIEW),
  asyncHandler(async (req, res) => ok(res, await pageService.getBlocks(Number(req.params.id)))),
);

router.put(
  '/:id(\\d+)/blocks',
  authorize(PERMISSIONS.PAGES_UPDATE),
  validate({ body: saveBlocksSchema }),
  asyncHandler(async (req, res) =>
    ok(res, await pageService.saveBlocks(Number(req.params.id), req.body.blocks), 'Blocks saved'),
  ),
);

router.post(
  '/:id(\\d+)/duplicate',
  authorize(PERMISSIONS.PAGES_CREATE),
  asyncHandler(async (req, res) => created(res, await pageService.duplicate(Number(req.params.id)))),
);

export const pagesModule: FeatureModule = { name: 'pages', basePath: '/pages', router };
