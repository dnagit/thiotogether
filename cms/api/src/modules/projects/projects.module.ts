import { z } from 'zod';
import { Router } from 'express';
import { prisma } from '../../core/database/prisma.js';
import { BaseRepository } from '../../core/base/BaseRepository.js';
import { BaseService } from '../../core/base/BaseService.js';
import { BaseController } from '../../core/base/BaseController.js';
import { crudRouter } from '../../core/base/crudRouter.js';
import { ConflictError } from '../../core/errors/AppError.js';
import { PERMISSIONS, slugify } from '@cms/shared';
import type { FeatureModule } from '../../core/modules.js';

/**
 * Projects — the work this site has to show: posters, fan projects, events.
 *
 * The list is drawn on the public site by a page block rather than by a route of its own, so
 * that a projects page is an ordinary page and can carry a call to action beside the grid.
 * The detail page is a route, since it is one project per URL.
 */

/** A picture in a project's gallery. Stored as a JSON array on the row — see the schema. */
const imageSchema = z.object({
  url: z.string().min(1).max(500),
  caption: z.string().max(300).nullish(),
});

export const projectSchema = z.object({
  title: z.string().min(1).max(200),
  /** Optional: generated from the title when left out. */
  slug: z.string().max(200).nullish(),
  summary: z.string().max(500).nullish(),
  description: z.string().nullish(),
  coverImage: z.string().max(500).nullish(),
  images: z.array(imageSchema).default([]),
  /** Accepts a date or a plain `YYYY-MM-DD`, and an empty field means "no date". */
  eventDate: z.coerce.date().nullish(),
  /** The button under the write-up on the detail page. It needs both a label and a link. */
  ctaLabel: z.string().max(100).nullish(),
  ctaUrl: z.string().max(500).nullish(),
  /** Blank means "use the site's colours". */
  ctaColor: z.string().max(30).nullish(),
  ctaTextColor: z.string().max(30).nullish(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  metaTitle: z.string().max(255).nullish(),
  metaDescription: z.string().max(500).nullish(),
});

class ProjectRepository extends BaseRepository<any> {
  protected modelName = 'project';
  protected searchFields = ['title', 'slug', 'summary'];
  protected filterableFields = ['isActive'];
  protected sortableFields = ['id', 'title', 'sortOrder', 'eventDate', 'createdAt'];
  protected defaultOrderBy: Record<string, 'asc' | 'desc'> = { sortOrder: 'asc' };
}

class ProjectService extends BaseService<any> {
  protected repository = new ProjectRepository();
  protected resourceName = 'Project';

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
    const existing = await prisma.project.findFirst({
      where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (existing) throw new ConflictError(`Slug "${slug}" is already in use`);
  }
}

class ProjectController extends BaseController<any> {
  protected service = new ProjectService();
}

const router: Router = crudRouter({
  controller: new ProjectController(),
  resource: 'projects',
  permissions: {
    view: PERMISSIONS.PROJECTS_VIEW,
    create: PERMISSIONS.PROJECTS_MANAGE,
    update: PERMISSIONS.PROJECTS_MANAGE,
    delete: PERMISSIONS.PROJECTS_MANAGE,
  },
  createSchema: projectSchema,
  updateSchema: projectSchema.partial(),
});

export const projectsModule: FeatureModule = {
  name: 'projects',
  basePath: '/projects',
  router,
};
