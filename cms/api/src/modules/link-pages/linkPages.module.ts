import { z } from 'zod';
import { Router } from 'express';
import { prisma } from '../../core/database/prisma.js';
import { BaseRepository } from '../../core/base/BaseRepository.js';
import { BaseService } from '../../core/base/BaseService.js';
import { BaseController } from '../../core/base/BaseController.js';
import { crudRouter } from '../../core/base/crudRouter.js';
import { ConflictError } from '../../core/errors/AppError.js';
import { config } from '../../core/config/index.js';
import type { FindAllResult } from '../../core/base/BaseRepository.js';
import type { ParsedListQuery } from '../../core/utils/pagination.js';
import { PERMISSIONS, slugify } from '@cms/shared';
import type { FeatureModule } from '../../core/modules.js';

/**
 * Link pages — one address that fans out to every streaming service and social account,
 * made to be printed as a QR code. The website draws it at `/link/:slug`; the admin makes
 * the QR code from that address, so nothing here knows a QR code exists.
 */

/** A button on the page. Stored as a JSON array on the row — see the schema. */
const linkSchema = z.object({
  /** A key from `LINK_PLATFORMS`; it picks the logo and the defaults below. */
  platform: z.string().min(1).max(50),
  url: z.string().min(1).max(1000),
  /** Blank means the platform's own name. */
  label: z.string().max(100).nullish(),
  /** The button text. Blank means the platform's default — Play, Follow, Go To. */
  action: z.string().max(40).nullish(),
  /** A picture to use instead of the platform's logo — for a service the list has no logo for. */
  icon: z.string().max(500).nullish(),
});

export const linkPageSchema = z.object({
  title: z.string().min(1).max(200),
  /** Optional: generated from the title when left out. */
  slug: z.string().max(200).nullish(),
  subtitle: z.string().max(300).nullish(),
  coverImage: z.string().max(500).nullish(),
  links: z.array(linkSchema).default([]),
  /** Blank means the blurred cover. */
  backgroundColor: z.string().max(30).nullish(),
  isActive: z.boolean().default(true),
  metaTitle: z.string().max(255).nullish(),
  metaDescription: z.string().max(500).nullish(),
});

class LinkPageRepository extends BaseRepository<any> {
  protected modelName = 'linkPage';
  protected searchFields = ['title', 'slug', 'subtitle'];
  protected filterableFields = ['isActive'];
  protected sortableFields = ['id', 'title', 'createdAt', 'updatedAt'];
  protected defaultOrderBy: Record<string, 'asc' | 'desc'> = { createdAt: 'desc' };
}

/**
 * Where the page lives on the website — what the admin shows and turns into a QR code.
 *
 * Built here rather than in the admin because the API is the one that is sure to know the
 * website's address: `WEBSITE_URL` has to be right for CORS, while the admin's own copy is
 * baked in at build time and falls back to the admin's origin when it is missing — which
 * printed QR codes pointing at the admin.
 */
const withPublicUrl = (row: any): any =>
  row && { ...row, publicUrl: `${config.WEBSITE_URL.replace(/\/+$/, '')}/link/${row.slug}` };

class LinkPageService extends BaseService<any> {
  protected repository = new LinkPageRepository();
  protected resourceName = 'Link page';

  async list(query: ParsedListQuery): Promise<FindAllResult<any>> {
    const result = await super.list(query);
    return { ...result, items: result.items.map(withPublicUrl) };
  }

  async getById(id: number): Promise<any> {
    return withPublicUrl(await super.getById(id));
  }

  async create(data: any, actorId?: number): Promise<any> {
    return withPublicUrl(await super.create(data, actorId));
  }

  async update(id: number, data: any, actorId?: number): Promise<any> {
    return withPublicUrl(await super.update(id, data, actorId));
  }

  protected async beforeCreate(data: any): Promise<any> {
    data.slug = data.slug || slugify(data.title);
    await this.assertSlugFree(data.slug);
    return data;
  }

  protected async beforeUpdate(id: number, data: any): Promise<any> {
    if (data.slug) await this.assertSlugFree(data.slug, id);
    return data;
  }

  private async assertSlugFree(slug: string, excludeId?: number): Promise<void> {
    const existing = await prisma.linkPage.findFirst({
      where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (existing) throw new ConflictError(`Slug "${slug}" is already in use`);
  }
}

class LinkPageController extends BaseController<any> {
  protected service = new LinkPageService();
}

const router: Router = crudRouter({
  controller: new LinkPageController(),
  resource: 'link-pages',
  permissions: {
    view: PERMISSIONS.LINK_PAGES_VIEW,
    create: PERMISSIONS.LINK_PAGES_MANAGE,
    update: PERMISSIONS.LINK_PAGES_MANAGE,
    delete: PERMISSIONS.LINK_PAGES_MANAGE,
  },
  createSchema: linkPageSchema,
  updateSchema: linkPageSchema.partial(),
});

export const linkPagesModule: FeatureModule = {
  name: 'link-pages',
  basePath: '/link-pages',
  router,
};
