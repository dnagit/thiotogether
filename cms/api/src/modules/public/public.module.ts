import { z } from 'zod';
import { Router, type Response } from 'express';
import { prisma } from '../../core/database/prisma.js';
import { validate } from '../../core/middleware/validate.js';
import { submissionLimiter } from '../../core/middleware/rateLimit.js';
import { uploadSlip } from '../../core/middleware/upload.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { ok, created } from '../../core/base/BaseController.js';
import { BadRequestError, NotFoundError } from '../../core/errors/AppError.js';
import { pageService } from '../pages/pages.service.js';
import { loadMenuTree } from '../menus/menus.module.js';
import { handlePublicSubmission } from '../forms/forms.module.js';
import { donationService } from '../donations/donations.service.js';
import { projectService, stripAmountsForPublic } from '../donation-projects/donationProjects.module.js';
import { getSettingsMap } from '../settings/settings.module.js';
import { buildSharePreview, renderSharePreview } from './sharePreview.js';
import { config } from '../../core/config/index.js';
import type { FeatureModule } from '../../core/modules.js';

/**
 * Public, unauthenticated API consumed by the website.
 * Everything here returns published/active content only.
 */
const router = Router();

/**
 * Cache public content in production, never in development.
 *
 * These responses are edited through the admin, so a live TTL in development makes
 * a saved change look like it did nothing — the browser keeps replaying the cached
 * menu/settings/page for up to `seconds` even across a normal refresh. In production
 * the same TTL is exactly what we want, so it is kept there.
 */
function publicCache(res: Response, seconds: number): void {
  res.setHeader('Cache-Control', config.isProd ? `public, max-age=${seconds}` : 'no-store');
}

// ── Pages & routing ─────────────────────────────────────────

router.get(
  '/pages/resolve',
  asyncHandler(async (req, res) => {
    const path = typeof req.query.path === 'string' ? req.query.path : '/';
    const page = await pageService.getPublishedByPath(path);
    // Short CDN/browser cache; content changes invalidate within a minute.
    publicCache(res, 60);
    ok(res, page);
  }),
);

router.get(
  '/pages/paths',
  asyncHandler(async (_req, res) => {
    publicCache(res, 300);
    ok(res, await pageService.getPublishedPaths());
  }),
);

// ── Menus ───────────────────────────────────────────────────

router.get(
  '/menus/:location',
  asyncHandler(async (req, res) => {
    const menu = await prisma.menu.findFirst({
      where: { location: req.params.location, isActive: true },
    });
    if (!menu) throw new NotFoundError('Menu');
    publicCache(res, 60);
    ok(res, { ...menu, items: await loadMenuTree(menu.id, true) });
  }),
);

// ── Projects ────────────────────────────────────────────────

/** What the list and the detail page are allowed to see. Draft rows never leave the API. */
const projectSelect = {
  id: true,
  title: true,
  slug: true,
  summary: true,
  coverImage: true,
  eventDate: true,
} as const;

router.get(
  '/projects',
  asyncHandler(async (_req, res) => {
    const projects = await prisma.project.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: projectSelect,
    });
    publicCache(res, 120);
    ok(res, projects);
  }),
);

router.get(
  '/projects/:slug',
  asyncHandler(async (req, res) => {
    const project = await prisma.project.findFirst({
      where: { slug: req.params.slug, isActive: true },
      // The gallery and the long text are the detail page's alone; the list carries neither.
      select: {
        ...projectSelect,
        description: true,
        images: true,
        metaTitle: true,
        metaDescription: true,
      },
    });
    if (!project) throw new NotFoundError('Project');
    publicCache(res, 120);
    ok(res, project);
  }),
);

// ── Settings / theme ────────────────────────────────────────

router.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    // Only groups safe for public exposure.
    const [general, theme, seo, social, contact, popup] = await Promise.all([
      getSettingsMap('general'),
      getSettingsMap('theme'),
      getSettingsMap('seo'),
      getSettingsMap('social'),
      getSettingsMap('contact'),
      getSettingsMap('popup'),
    ]);
    publicCache(res, 120);
    // The popup stays nested: the website reads it as one object, and a flat `popupEnabled`
    // sitting beside `siteName` would read as a site-wide flag rather than one feature's.
    ok(res, { ...general, ...contact, theme, seoDefaults: seo, socialLinks: social, popup });
  }),
);

// ── Forms ───────────────────────────────────────────────────

router.get(
  '/forms/:slug',
  asyncHandler(async (req, res) => {
    const form = await prisma.form.findFirst({
      where: { slug: req.params.slug, isActive: true },
      select: {
        id: true, name: true, slug: true, description: true,
        submitLabel: true, successMessage: true,
        fields: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true, type: true, name: true, label: true, placeholder: true,
            helpText: true, required: true, options: true, validation: true,
            sortOrder: true, width: true,
          },
        },
      },
    });
    if (!form) throw new NotFoundError('Form');
    ok(res, form);
  }),
);

router.post(
  '/forms/:slug/submit',
  submissionLimiter,
  validate({ body: z.object({ data: z.record(z.unknown()) }) }),
  asyncHandler(async (req, res) => {
    const result = await handlePublicSubmission(req.params.slug, req.body.data, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    created(res, result, result.successMessage);
  }),
);

// ── Donations ───────────────────────────────────────────────

router.get(
  '/donation-projects',
  asyncHandler(async (_req, res) => {
    const projects = await prisma.donationProject.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        bankAccounts: { include: { bankAccount: true } },
      },
    });
    const withStats = await Promise.all(
      projects.map(async (p) =>
        stripAmountsForPublic({
          ...p,
          bankAccounts: p.bankAccounts
            .map((pb) => pb.bankAccount)
            .filter((b) => b.isActive && !b.deletedAt),
          stats: await projectService.getStats(p.id),
        }),
      ),
    );
    publicCache(res, 30);
    ok(res, withStats);
  }),
);

router.get(
  '/donation-projects/:slug',
  asyncHandler(async (req, res) => {
    const project = await prisma.donationProject.findFirst({
      where: { slug: req.params.slug, isActive: true },
      include: { bankAccounts: { include: { bankAccount: true } } },
    });
    if (!project) throw new NotFoundError('Donation project');
    ok(
      res,
      stripAmountsForPublic({
        ...project,
        bankAccounts: project.bankAccounts
          .map((pb) => pb.bankAccount)
          .filter((b) => b.isActive && !b.deletedAt),
        stats: await projectService.getStats(project.id),
      }),
    );
  }),
);

const donationSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  nickname: z.string().min(1).max(150),
  accountName: z.string().min(1).max(150),
  contactInfo: z.string().min(1).max(500),
  amount: z.coerce.number().positive().max(100_000_000),
  transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  transferTime: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/),
  remark: z.string().max(500).optional(),
});

router.post(
  '/donations',
  submissionLimiter,
  uploadSlip.single('slip'),
  validate({ body: donationSchema }),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new BadRequestError('Transfer slip image is required');
    const donation = await donationService.submit(req.body, req.file);
    created(
      res,
      {
        donationCode: donation.donationCode,
        projectName: donation.project.name,
        amount: Number(donation.amount),
        status: donation.status,
      },
      'Thank you for your donation! It is pending verification.',
    );
  }),
);

router.get(
  '/donations/:code/status',
  asyncHandler(async (req, res) => ok(res, await donationService.publicStatus(req.params.code))),
);

// ── Visitor counter ─────────────────────────────────────────

router.post(
  '/visit',
  asyncHandler(async (_req, res) => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await prisma.visitorStat.upsert({
      where: { date: today },
      create: { date: today, count: 1 },
      update: { count: { increment: 1 } },
    });
    ok(res, null);
  }),
);

// ── SEO: sitemap & robots ───────────────────────────────────

router.get(
  '/sitemap.xml',
  asyncHandler(async (_req, res) => {
    const [pages, projects] = await Promise.all([
      pageService.getPublishedPaths(),
      prisma.donationProject.findMany({
        where: { isActive: true },
        select: { slug: true, updatedAt: true },
      }),
    ]);
    const urls = [
      ...pages.map((p) => ({ loc: `${config.WEBSITE_URL}${p.path}`, lastmod: p.updatedAt })),
      ...projects.map((p) => ({
        loc: `${config.WEBSITE_URL}/donation/${p.slug}`,
        lastmod: p.updatedAt,
      })),
    ];
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls
        .map(
          (u) =>
            `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod.toISOString().slice(0, 10)}</lastmod></url>`,
        )
        .join('\n') +
      `\n</urlset>`;
    res.setHeader('Content-Type', 'application/xml');
    publicCache(res, 3600);
    res.send(xml);
  }),
);

/**
 * HTML shell with real Open Graph tags, for link-preview scrapers only.
 * nginx routes matching user agents here; see deploy/nginx-spa.conf.
 */
router.get(
  '/share-preview',
  asyncHandler(async (req, res) => {
    const path = typeof req.query.path === 'string' ? req.query.path : '/';
    const preview = await buildSharePreview(path);
    res.type('html');
    publicCache(res, 300);
    res.send(renderSharePreview(preview));
  }),
);

router.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\nSitemap: ${config.WEBSITE_URL}/sitemap.xml\n`,
  );
});

export const publicModule: FeatureModule = { name: 'public', basePath: '/public', router };
