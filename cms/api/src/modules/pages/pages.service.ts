import { prisma } from '../../core/database/prisma.js';
import { BaseRepository } from '../../core/base/BaseRepository.js';
import { BaseService } from '../../core/base/BaseService.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../core/errors/AppError.js';
import { buildTree, joinPath } from '@cms/shared';
import type { z } from 'zod';
import type { blockSchema } from './pages.validation.js';

class PageRepository extends BaseRepository<any> {
  protected modelName = 'page';
  protected searchFields = ['title', 'slug', 'path'];
  protected filterableFields = ['status', 'parentId', 'isHome'];
  protected sortableFields = ['id', 'title', 'path', 'createdAt', 'updatedAt', 'sortOrder', 'publishedAt'];
  protected defaultOrderBy: Record<string, 'asc' | 'desc'> = { sortOrder: 'asc' };
}

export class PageService extends BaseService<any> {
  protected repository = new PageRepository();
  protected resourceName = 'Page';

  protected async beforeCreate(data: any): Promise<any> {
    await this.assertValidParent(null, data.parentId);
    const path = await this.computePath(data.slug, data.parentId);
    await this.assertPathFree(path);
    if (data.isHome) await this.clearHomeFlag();
    if (data.status === 'PUBLISHED' && !data.publishedAt) data.publishedAt = new Date();
    return { ...data, path };
  }

  protected async beforeUpdate(id: number, data: any): Promise<any> {
    const current = await this.getById(id);
    const slugChanged = data.slug !== undefined && data.slug !== current.slug;
    const parentChanged = data.parentId !== undefined && data.parentId !== current.parentId;

    if (parentChanged) await this.assertValidParent(id, data.parentId);
    if (data.isHome && !current.isHome) await this.clearHomeFlag();
    if (data.status === 'PUBLISHED' && current.status !== 'PUBLISHED' && !data.publishedAt) {
      data.publishedAt = new Date();
    }

    if (slugChanged || parentChanged) {
      const newPath = await this.computePath(
        data.slug ?? current.slug,
        parentChanged ? data.parentId : current.parentId,
      );
      await this.assertPathFree(newPath, id);
      data.path = newPath;
    }
    return data;
  }

  /** Repath the entire subtree after slug/parent change — children follow automatically. */
  protected async afterUpdate(entity: any): Promise<void> {
    await this.recomputeChildPaths(entity.id, entity.path);
  }

  protected async beforeDelete(id: number): Promise<void> {
    const childCount = await prisma.page.count({ where: { parentId: id } });
    if (childCount > 0) {
      throw new BadRequestError('Page has child pages — move or delete them first');
    }
  }

  // ── Tree & public queries ─────────────────────────────────

  async getTree(): Promise<any[]> {
    const pages = await prisma.page.findMany({
      select: {
        id: true, title: true, slug: true, path: true, status: true,
        sortOrder: true, parentId: true, isHome: true, updatedAt: true,
      },
      orderBy: { sortOrder: 'asc' },
    });
    return buildTree(pages as any);
  }

  /** Public: resolve a published page (with blocks) by URL path. */
  async getPublishedByPath(path: string): Promise<any> {
    const normalized = path === '' ? '/' : path;
    const where =
      normalized === '/'
        ? { isHome: true, status: 'PUBLISHED' as const }
        : { path: normalized, status: 'PUBLISHED' as const };
    const page = await prisma.page.findFirst({
      where,
      include: {
        blocks: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!page) throw new NotFoundError('Page');
    return page;
  }

  /** Public: list of published paths (routes + sitemap). */
  async getPublishedPaths(): Promise<Array<{ path: string; updatedAt: Date }>> {
    return prisma.page.findMany({
      where: { status: 'PUBLISHED' },
      select: { path: true, updatedAt: true },
      orderBy: { path: 'asc' },
    });
  }

  // ── Blocks ────────────────────────────────────────────────

  async getBlocks(pageId: number): Promise<any[]> {
    await this.getById(pageId);
    return prisma.pageBlock.findMany({ where: { pageId }, orderBy: { sortOrder: 'asc' } });
  }

  /**
   * Replace-style save from the page builder: upsert incoming blocks,
   * soft-delete blocks that were removed, in one transaction.
   */
  async saveBlocks(pageId: number, blocks: Array<z.infer<typeof blockSchema>>): Promise<any[]> {
    await this.getById(pageId);
    const keepIds = blocks.filter((b) => b.id).map((b) => b.id!) as number[];

    await prisma.$transaction(async (tx) => {
      await tx.pageBlock.updateMany({
        where: { pageId, id: { notIn: keepIds.length ? keepIds : [0] }, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      for (const [index, block] of blocks.entries()) {
        const data = {
          type: block.type,
          props: block.props as any,
          styles: block.styles as any,
          settings: block.settings as any,
          sortOrder: index,
        };
        if (block.id) {
          await tx.pageBlock.update({ where: { id: block.id }, data });
        } else {
          await tx.pageBlock.create({ data: { ...data, pageId } });
        }
      }
    });
    return this.getBlocks(pageId);
  }

  async duplicate(id: number): Promise<any> {
    const source = await this.getById(id);
    const blocks = await this.getBlocks(id);
    const copySlug = `${source.slug}-copy-${Date.now().toString(36)}`;
    const path = await this.computePath(copySlug, source.parentId);
    return prisma.page.create({
      data: {
        title: `${source.title} (copy)`,
        slug: copySlug,
        path,
        parentId: source.parentId,
        featuredImage: source.featuredImage,
        bannerImage: source.bannerImage,
        status: 'DRAFT',
        sortOrder: source.sortOrder + 1,
        metaTitle: source.metaTitle,
        metaDescription: source.metaDescription,
        blocks: {
          create: blocks.map((b: any, i: number) => ({
            type: b.type, props: b.props, styles: b.styles, settings: b.settings, sortOrder: i,
          })),
        },
      },
    });
  }

  // ── Internals ─────────────────────────────────────────────

  private async computePath(slug: string, parentId?: number | null): Promise<string> {
    if (!parentId) return joinPath(slug);
    const parent = await prisma.page.findFirst({ where: { id: parentId } });
    if (!parent) throw new BadRequestError('Parent page not found');
    return joinPath(parent.path, slug);
  }

  private async assertPathFree(path: string, excludeId?: number): Promise<void> {
    const existing = await prisma.page.findFirst({
      where: { path, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (existing) throw new ConflictError(`URL path "${path}" is already in use`);
  }

  /** Parent must exist and must not be the page itself or one of its descendants. */
  private async assertValidParent(id: number | null, parentId?: number | null): Promise<void> {
    if (!parentId) return;
    if (id !== null && parentId === id) throw new BadRequestError('Page cannot be its own parent');
    let cursor: number | null = parentId;
    while (cursor !== null) {
      const node: { id: number; parentId: number | null } | null = await prisma.page.findFirst({
        where: { id: cursor },
        select: { id: true, parentId: true },
      });
      if (!node) throw new BadRequestError('Parent page not found');
      if (id !== null && node.parentId === id) {
        throw new BadRequestError('Cannot move a page under its own descendant');
      }
      cursor = node.parentId;
    }
  }

  private async recomputeChildPaths(parentId: number, parentPath: string): Promise<void> {
    const children = await prisma.page.findMany({ where: { parentId } });
    for (const child of children) {
      const newPath = joinPath(parentPath, child.slug);
      if (newPath !== child.path) {
        await prisma.page.update({ where: { id: child.id }, data: { path: newPath } });
      }
      await this.recomputeChildPaths(child.id, newPath);
    }
  }

  private async clearHomeFlag(): Promise<void> {
    await prisma.page.updateMany({ where: { isHome: true }, data: { isHome: false } });
  }
}

export const pageService = new PageService();
