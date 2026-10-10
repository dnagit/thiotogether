import { z } from 'zod';
import { Router } from 'express';
import { prisma } from '../../core/database/prisma.js';
import { BaseRepository } from '../../core/base/BaseRepository.js';
import { BaseService } from '../../core/base/BaseService.js';
import { BaseController, ok } from '../../core/base/BaseController.js';
import { crudRouter } from '../../core/base/crudRouter.js';
import { authenticate } from '../../core/middleware/authenticate.js';
import { authorize } from '../../core/middleware/authorize.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { NotFoundError } from '../../core/errors/AppError.js';
import { PERMISSIONS } from '@cms/shared';
import { readImage, sendImage } from '../dj-schedule/djSchedule.module.js';
import type { FeatureModule } from '../../core/modules.js';

/**
 * Food trails: restaurants, and the dishes at each, that fans tick off as they eat their way
 * along them.
 *
 *   /food-trails/trails              → standard CRUD over the trails
 *   GET /food-trails/trails/:id/tree → one trail with every restaurant and dish, in order
 *   /food-trails/places              → standard CRUD over restaurants
 *   /food-trails/menus               → standard CRUD over dishes
 *   GET /food-trails/assets/place/:id, /assets/menu/:id → a picture's bytes, for the poster
 *
 * Restaurants and dishes may carry a picture; those go on the poster the admin draws and
 * saves, and never to the website — `/public/food-trail` sends names only.
 */

const PERMS = {
  view: PERMISSIONS.FOOD_TRAILS_VIEW,
  create: PERMISSIONS.FOOD_TRAILS_MANAGE,
  update: PERMISSIONS.FOOD_TRAILS_MANAGE,
  delete: PERMISSIONS.FOOD_TRAILS_MANAGE,
};

// ── Trails ──────────────────────────────────────────────────

const trailSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(1000).nullish(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

class FoodTrailRepository extends BaseRepository<any> {
  protected modelName = 'foodTrail';
  protected searchFields = ['name'];
  protected filterableFields = ['isActive'];
  protected sortableFields = ['id', 'name', 'sortOrder', 'createdAt'];
  protected defaultOrderBy: Record<string, 'asc' | 'desc'> = { sortOrder: 'asc' };
  // The soft-delete extension filters top-level queries only, so the count says so itself.
  protected defaultInclude = {
    _count: { select: { places: { where: { deletedAt: null } } } },
  };
}

class FoodTrailService extends BaseService<any> {
  protected repository = new FoodTrailRepository();
  protected resourceName = 'Food trail';
}

class FoodTrailController extends BaseController<any> {
  protected service = new FoodTrailService();
}

const trailRouter: Router = crudRouter({
  controller: new FoodTrailController(),
  resource: 'food-trails',
  permissions: PERMS,
  createSchema: trailSchema,
  updateSchema: trailSchema.partial(),
});

/** Restaurants, then dishes within each, in the order the admin set. */
export const placeOrder = [{ sortOrder: 'asc' as const }, { id: 'asc' as const }];

trailRouter.get(
  '/:id(\\d+)/tree',
  authorize(PERMISSIONS.FOOD_TRAILS_VIEW),
  asyncHandler(async (req, res) => {
    const trail = await prisma.foodTrail.findFirst({
      where: { id: Number(req.params.id) },
      include: {
        places: {
          where: { deletedAt: null },
          orderBy: placeOrder,
          include: { menus: { where: { deletedAt: null }, orderBy: placeOrder } },
        },
      },
    });
    if (!trail) throw new NotFoundError('Food trail');
    ok(res, trail);
  }),
);

// ── Restaurants ─────────────────────────────────────────────

const placeSchema = z.object({
  trailId: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  note: z.string().max(1000).nullish(),
  image: z.string().max(500).nullish(),
  sortOrder: z.number().int().default(0),
});

async function assertTrail(trailId: number): Promise<void> {
  const trail = await prisma.foodTrail.findFirst({ where: { id: trailId } });
  if (!trail) throw new NotFoundError('Food trail');
}

class FoodPlaceRepository extends BaseRepository<any> {
  protected modelName = 'foodPlace';
  protected searchFields = ['name'];
  protected filterableFields = ['trailId'];
  protected defaultOrderBy: Record<string, 'asc' | 'desc'> = { sortOrder: 'asc' };
}

class FoodPlaceService extends BaseService<any> {
  protected repository = new FoodPlaceRepository();
  protected resourceName = 'Restaurant';

  protected async beforeCreate(data: any): Promise<any> {
    await assertTrail(data.trailId);
    return data;
  }

  protected async beforeUpdate(_id: number, data: any): Promise<any> {
    if (data.trailId) await assertTrail(data.trailId);
    return data;
  }
}

class FoodPlaceController extends BaseController<any> {
  protected service = new FoodPlaceService();
}

const placeRouter: Router = crudRouter({
  controller: new FoodPlaceController(),
  resource: 'food-places',
  permissions: PERMS,
  createSchema: placeSchema,
  updateSchema: placeSchema.partial(),
});

// ── Dishes ──────────────────────────────────────────────────

const menuSchema = z.object({
  placeId: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  image: z.string().max(500).nullish(),
  sortOrder: z.number().int().default(0),
});

async function assertPlace(placeId: number): Promise<void> {
  const place = await prisma.foodPlace.findFirst({ where: { id: placeId } });
  if (!place) throw new NotFoundError('Restaurant');
}

class FoodMenuRepository extends BaseRepository<any> {
  protected modelName = 'foodMenu';
  protected searchFields = ['name'];
  protected filterableFields = ['placeId'];
  protected defaultOrderBy: Record<string, 'asc' | 'desc'> = { sortOrder: 'asc' };
}

class FoodMenuService extends BaseService<any> {
  protected repository = new FoodMenuRepository();
  protected resourceName = 'Menu';

  protected async beforeCreate(data: any): Promise<any> {
    await assertPlace(data.placeId);
    return data;
  }

  protected async beforeUpdate(_id: number, data: any): Promise<any> {
    if (data.placeId) await assertPlace(data.placeId);
    return data;
  }
}

class FoodMenuController extends BaseController<any> {
  protected service = new FoodMenuService();
}

const menuRouter: Router = crudRouter({
  controller: new FoodMenuController(),
  resource: 'food-menus',
  permissions: PERMS,
  createSchema: menuSchema,
  updateSchema: menuSchema.partial(),
});

// ── Pictures for the poster ─────────────────────────────────

/*
 * The admin draws the poster in a <canvas>; pictures come through here, from the API's own
 * origin, for the same reason as the DJ schedule's — see `readImage` there. Only pictures a
 * restaurant or dish already names are served, looked up by id.
 */
const assetRouter = Router();

assetRouter.get(
  '/place/:id(\\d+)',
  authorize(PERMISSIONS.FOOD_TRAILS_VIEW),
  asyncHandler(async (req, res) => {
    const place = await prisma.foodPlace.findFirst({ where: { id: Number(req.params.id) } });
    if (!place?.image) throw new NotFoundError('Restaurant image');
    sendImage(res, await readImage(place.image));
  }),
);

assetRouter.get(
  '/menu/:id(\\d+)',
  authorize(PERMISSIONS.FOOD_TRAILS_VIEW),
  asyncHandler(async (req, res) => {
    const menu = await prisma.foodMenu.findFirst({ where: { id: Number(req.params.id) } });
    if (!menu?.image) throw new NotFoundError('Menu image');
    sendImage(res, await readImage(menu.image));
  }),
);

const router = Router();
router.use('/trails', trailRouter);
router.use('/places', placeRouter);
router.use('/menus', menuRouter);
router.use('/assets', authenticate, assetRouter);

export const foodTrailModule: FeatureModule = {
  name: 'food-trail',
  basePath: '/food-trails',
  router,
};
