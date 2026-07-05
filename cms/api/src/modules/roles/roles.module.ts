import { z } from 'zod';
import { Router } from 'express';
import { prisma } from '../../core/database/prisma.js';
import { authenticate } from '../../core/middleware/authenticate.js';
import { authorize } from '../../core/middleware/authorize.js';
import { validate } from '../../core/middleware/validate.js';
import { audit } from '../../core/middleware/audit.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { ok, created } from '../../core/base/BaseController.js';
import { BadRequestError, NotFoundError } from '../../core/errors/AppError.js';
import { PERMISSIONS, ALL_PERMISSIONS } from '@cms/shared';
import type { FeatureModule } from '../../core/modules.js';

const roleSchema = z.object({
  name: z.string().min(2).max(60).regex(/^[A-Z_]+$/, 'Uppercase letters and underscores only'),
  displayName: z.string().min(1).max(120),
  description: z.string().max(255).nullish(),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).default([]),
});

async function setRolePermissions(roleId: number, names: string[]): Promise<void> {
  const permissions = await prisma.permission.findMany({ where: { name: { in: names } } });
  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId, permissionId: p.id })),
    }),
  ]);
}

function serializeRole(role: any) {
  return {
    ...role,
    permissions: role.permissions?.map((rp: any) => rp.permission.name) ?? [],
  };
}

const roleInclude = { permissions: { include: { permission: true } } };

const router = Router();
router.use(authenticate, audit('roles'));

router.get(
  '/',
  authorize(PERMISSIONS.ROLES_VIEW),
  asyncHandler(async (_req, res) => {
    const roles = await prisma.role.findMany({ include: roleInclude, orderBy: { id: 'asc' } });
    ok(res, roles.map(serializeRole));
  }),
);

router.get(
  '/permissions',
  authorize(PERMISSIONS.ROLES_VIEW),
  asyncHandler(async (_req, res) => {
    ok(res, await prisma.permission.findMany({ orderBy: { name: 'asc' } }));
  }),
);

router.get(
  '/:id(\\d+)',
  authorize(PERMISSIONS.ROLES_VIEW),
  asyncHandler(async (req, res) => {
    const role = await prisma.role.findFirst({
      where: { id: Number(req.params.id) },
      include: roleInclude,
    });
    if (!role) throw new NotFoundError('Role');
    ok(res, serializeRole(role));
  }),
);

router.post(
  '/',
  authorize(PERMISSIONS.ROLES_MANAGE),
  validate({ body: roleSchema }),
  asyncHandler(async (req, res) => {
    const { permissions, ...data } = req.body;
    const role = await prisma.role.create({ data });
    await setRolePermissions(role.id, permissions);
    const full = await prisma.role.findFirst({ where: { id: role.id }, include: roleInclude });
    created(res, serializeRole(full));
  }),
);

router.put(
  '/:id(\\d+)',
  authorize(PERMISSIONS.ROLES_MANAGE),
  validate({ body: roleSchema.partial() }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await prisma.role.findFirst({ where: { id } });
    if (!existing) throw new NotFoundError('Role');
    if (existing.isSystem && req.body.name && req.body.name !== existing.name) {
      throw new BadRequestError('System roles cannot be renamed');
    }
    const { permissions, ...data } = req.body;
    await prisma.role.update({ where: { id }, data });
    if (permissions) await setRolePermissions(id, permissions);
    const full = await prisma.role.findFirst({ where: { id }, include: roleInclude });
    ok(res, serializeRole(full), 'Updated');
  }),
);

router.delete(
  '/:id(\\d+)',
  authorize(PERMISSIONS.ROLES_MANAGE),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const role = await prisma.role.findFirst({ where: { id } });
    if (!role) throw new NotFoundError('Role');
    if (role.isSystem) throw new BadRequestError('System roles cannot be deleted');
    const usersWithRole = await prisma.user.count({ where: { roleId: id } });
    if (usersWithRole > 0) throw new BadRequestError('Role is assigned to users');
    await prisma.role.delete({ where: { id } });
    ok(res, null, 'Deleted');
  }),
);

export const rolesModule: FeatureModule = { name: 'roles', basePath: '/roles', router };
