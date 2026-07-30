import { z } from 'zod';
import { Router } from 'express';
import { BaseRepository } from '../../core/base/BaseRepository.js';
import { BaseService } from '../../core/base/BaseService.js';
import { BaseController, ok } from '../../core/base/BaseController.js';
import { crudRouter } from '../../core/base/crudRouter.js';
import { hashPassword } from '../../core/utils/hash.js';
import { blank } from '../../core/utils/zod.js';
import { BadRequestError } from '../../core/errors/AppError.js';
import { prisma } from '../../core/database/prisma.js';
import { PERMISSIONS } from '@cms/shared';
import type { FeatureModule } from '../../core/modules.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { authorize } from '../../core/middleware/authorize.js';

// ── Validation ──────────────────────────────────────────────
export const createUserSchema = z.object({
  // Lowercased to match the auth flow — `users.email` is case-sensitive on PostgreSQL.
  email: z.string().email().toLowerCase(),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(100),
  roleId: z.number().int().positive(),
  isActive: z.boolean().default(true),
  avatarUrl: blank(z.string().url().nullish()),
});

export const updateUserSchema = createUserSchema.partial().extend({
  password: z.string().min(8).max(100).optional(),
});

// ── Repository ──────────────────────────────────────────────
class UserRepository extends BaseRepository<any> {
  protected modelName = 'user';
  protected searchFields = ['email', 'name'];
  protected filterableFields = ['roleId', 'isActive'];
  protected sortableFields = ['id', 'email', 'name', 'createdAt', 'lastLoginAt'];
  protected defaultInclude = { role: { select: { id: true, name: true, displayName: true } } };
}

// ── Service ─────────────────────────────────────────────────
class UserService extends BaseService<any> {
  protected repository = new UserRepository();
  protected resourceName = 'User';

  protected async beforeCreate(data: any): Promise<any> {
    const { password, ...rest } = data;
    return { ...rest, passwordHash: await hashPassword(password) };
  }

  protected async beforeUpdate(_id: number, data: any): Promise<any> {
    const { password, ...rest } = data;
    if (password) rest.passwordHash = await hashPassword(password);
    return rest;
  }

  protected async beforeDelete(id: number, actorId?: number): Promise<void> {
    if (id === actorId) throw new BadRequestError('You cannot delete your own account');
    const superAdmins = await prisma.user.count({
      where: { role: { name: 'SUPER_ADMIN' }, isActive: true, id: { not: id } },
    });
    const target = await prisma.user.findFirst({ where: { id }, include: { role: true } });
    if (target?.role.name === 'SUPER_ADMIN' && superAdmins === 0) {
      throw new BadRequestError('Cannot delete the last super admin');
    }
  }

  /** Strip password hashes from every list/get response. */
  async list(query: any) {
    const result = await super.list(query);
    return { ...result, items: result.items.map(stripHash) };
  }
  async getById(id: number) {
    return stripHash(await super.getById(id));
  }
  async create(data: any, actorId?: number) {
    return stripHash(await super.create(data, actorId));
  }
  async update(id: number, data: any, actorId?: number) {
    return stripHash(await super.update(id, data, actorId));
  }
}

function stripHash<T extends { passwordHash?: string }>(user: T): Omit<T, 'passwordHash'> {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

// ── Controller & module ─────────────────────────────────────
class UserController extends BaseController<any> {
  protected service = new UserService();
}

const controller = new UserController();
const router: Router = crudRouter({
  controller,
  resource: 'users',
  permissions: {
    view: PERMISSIONS.USERS_VIEW,
    create: PERMISSIONS.USERS_CREATE,
    update: PERMISSIONS.USERS_UPDATE,
    delete: PERMISSIONS.USERS_DELETE,
  },
  createSchema: createUserSchema,
  updateSchema: updateUserSchema,
});

// Extra: list available roles for the user form dropdown.
router.get(
  '/roles/options',
  authorize(PERMISSIONS.USERS_VIEW),
  asyncHandler(async (_req, res) => {
    const roles = await prisma.role.findMany({
      select: { id: true, name: true, displayName: true },
      orderBy: { id: 'asc' },
    });
    ok(res, roles);
  }),
);

export const usersModule: FeatureModule = { name: 'users', basePath: '/users', router };
