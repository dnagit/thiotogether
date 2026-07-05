import { z } from 'zod';

const seoFields = {
  metaTitle: z.string().max(255).nullish(),
  metaDescription: z.string().max(500).nullish(),
  canonicalUrl: z.string().max(500).nullish(),
  ogTitle: z.string().max(255).nullish(),
  ogDescription: z.string().max(500).nullish(),
  ogImage: z.string().max(500).nullish(),
  twitterCard: z.enum(['summary', 'summary_large_image']).nullish(),
  jsonLd: z.record(z.unknown()).nullish(),
  noIndex: z.boolean().optional(),
};

export const createPageSchema = z.object({
  title: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9ก-๙-]+$/, 'Lowercase letters, numbers and dashes only'),
  parentId: z.number().int().positive().nullish(),
  featuredImage: z.string().max(500).nullish(),
  bannerImage: z.string().max(500).nullish(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
  publishedAt: z.coerce.date().nullish(),
  sortOrder: z.number().int().default(0),
  isHome: z.boolean().default(false),
  ...seoFields,
});

export const updatePageSchema = createPageSchema.partial();

export const blockSchema = z.object({
  id: z.number().int().positive().optional(), // present → update, absent → create
  type: z.string().min(1).max(80),
  props: z.record(z.unknown()).default({}),
  styles: z.record(z.unknown()).default({}),
  settings: z.record(z.unknown()).default({}),
  sortOrder: z.number().int().default(0),
});

export const saveBlocksSchema = z.object({
  blocks: z.array(blockSchema),
});
