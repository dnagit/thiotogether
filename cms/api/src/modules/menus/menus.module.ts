import { z } from 'zod';
import { Router } from 'express';
import { prisma } from '../../core/database/prisma.js';
import { authenticate } from '../../core/middleware/authenticate.js';
import { authorize } from '../../core/middleware/authorize.js';
import { validate } from '../../core/middleware/validate.js';
import { audit } from '../../core/middleware/audit.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { ok, created } from '../../core/base/BaseController.js';
import { NotFoundError } from '../../core/errors/AppError.js';
import { buildTree, PERMISSIONS } from '@cms/shared';
import type { FeatureModule } from '../../core/modules.js';

// ── Validation ──────────────────────────────────────────────
const menuSchema = z.object({
  name: z.string().min(1).max(120),
  location: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and dashes only'),
  isActive: z.boolean().default(true),
});

const menuItemSchema = z.object({
  id: z.number().int().positive().optional(),
  parentId: z.number().int().positive().nullish(),
  label: z.string().min(1).max(120),
  icon: z.string().max(80).nullish(),
  type: z.enum(['PAGE', 'EXTERNAL', 'CATEGORY', 'ANCHOR', 'CUSTOM']).default('PAGE'),
  pageId: z.number().int().positive().nullish(),
  url: z.string().max(500).nullish(),
  target: z.enum(['_self', '_blank']).default('_self'),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  children: z.array(z.any()).optional(), // recursive tree accepted from the builder UI
});

const saveItemsSchema = z.object({ items: z.array(menuItemSchema) });

// ── Helpers ─────────────────────────────────────────────────

/** Resolve the URL a menu item should navigate to. PAGE items follow the page path. */
function resolveUrl(item: any): string {
  switch (item.type) {
    case 'PAGE':
      return item.page?.path ?? '#';
    case 'ANCHOR':
      return item.url?.startsWith('#') ? item.url : `#${item.url ?? ''}`;
    default:
      return item.url ?? '#';
  }
}

const itemInclude = { page: { select: { id: true, path: true, title: true, status: true } } };

async function loadMenuTree(menuId: number, publicOnly: boolean): Promise<any[]> {
  const items = await prisma.menuItem.findMany({
    where: { menuId, ...(publicOnly ? { isActive: true } : {}) },
    include: itemInclude,
    orderBy: { sortOrder: 'asc' },
  });
  const withUrls = items
    // Hide items pointing at unpublished pages on the public site.
    .filter((i: any) => !publicOnly || i.type !== 'PAGE' || i.page?.status === 'PUBLISHED')
    .map((i: any) => ({ ...i, url: resolveUrl(i) }));
  return buildTree(withUrls as any);
}

/** Flatten the nested tree from the builder into rows with parent references. */
async function saveMenuItems(menuId: number, items: any[]): Promise<void> {
  const incomingIds: number[] = [];
  const collectIds = (nodes: any[]) => {
    for (const n of nodes) {
      if (n.id) incomingIds.push(n.id);
      if (n.children?.length) collectIds(n.children);
    }
  };
  collectIds(items);

  await prisma.$transaction(async (tx) => {
    await tx.menuItem.updateMany({
      where: { menuId, id: { notIn: incomingIds.length ? incomingIds : [0] }, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    const upsertLevel = async (nodes: any[], parentId: number | null) => {
      for (const [index, node] of nodes.entries()) {
        const data = {
          menuId,
          parentId,
          label: node.label,
          icon: node.icon ?? null,
          type: node.type ?? 'PAGE',
          pageId: node.type === 'PAGE' ? (node.pageId ?? null) : null,
          url: node.type === 'PAGE' ? null : (node.url ?? null),
          target: node.target ?? '_self',
          sortOrder: index,
          isActive: node.isActive ?? true,
        };
        let itemId: number;
        if (node.id) {
          await tx.menuItem.update({ where: { id: node.id }, data });
          itemId = node.id;
        } else {
          const createdItem = await tx.menuItem.create({ data });
          itemId = createdItem.id;
        }
        if (node.children?.length) await upsertLevel(node.children, itemId);
      }
    };
    await upsertLevel(items, null);
  });
}

// ── Routes ──────────────────────────────────────────────────
const router = Router();
router.use(authenticate, audit('menus'));

router.get(
  '/',
  authorize(PERMISSIONS.MENUS_VIEW),
  asyncHandler(async (_req, res) => {
    const menus = await prisma.menu.findMany({
      orderBy: { id: 'asc' },
      include: { _count: { select: { items: true } } },
    });
    ok(res, menus);
  }),
);

router.get(
  '/:id(\\d+)',
  authorize(PERMISSIONS.MENUS_VIEW),
  asyncHandler(async (req, res) => {
    const menu = await prisma.menu.findFirst({ where: { id: Number(req.params.id) } });
    if (!menu) throw new NotFoundError('Menu');
    ok(res, { ...menu, items: await loadMenuTree(menu.id, false) });
  }),
);

router.post(
  '/',
  authorize(PERMISSIONS.MENUS_MANAGE),
  validate({ body: menuSchema }),
  asyncHandler(async (req, res) => created(res, await prisma.menu.create({ data: req.body }))),
);

router.put(
  '/:id(\\d+)',
  authorize(PERMISSIONS.MENUS_MANAGE),
  validate({ body: menuSchema.partial() }),
  asyncHandler(async (req, res) => {
    const menu = await prisma.menu.update({ where: { id: Number(req.params.id) }, data: req.body });
    ok(res, menu, 'Updated');
  }),
);

router.put(
  '/:id(\\d+)/items',
  authorize(PERMISSIONS.MENUS_MANAGE),
  validate({ body: saveItemsSchema }),
  asyncHandler(async (req, res) => {
    const menuId = Number(req.params.id);
    const menu = await prisma.menu.findFirst({ where: { id: menuId } });
    if (!menu) throw new NotFoundError('Menu');
    await saveMenuItems(menuId, req.body.items);
    ok(res, await loadMenuTree(menuId, false), 'Menu items saved');
  }),
);

router.delete(
  '/:id(\\d+)',
  authorize(PERMISSIONS.MENUS_MANAGE),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const menu = await prisma.menu.findFirst({ where: { id } });
    if (!menu) throw new NotFoundError('Menu');
    await prisma.$transaction([
      prisma.menuItem.updateMany({ where: { menuId: id }, data: { deletedAt: new Date() } }),
      prisma.menu.update({ where: { id }, data: { deletedAt: new Date() } }),
    ]);
    ok(res, null, 'Deleted');
  }),
);

export const menusModule: FeatureModule = { name: 'menus', basePath: '/menus', router };
export { loadMenuTree };
