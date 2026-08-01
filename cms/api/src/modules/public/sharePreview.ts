import { prisma } from '../../core/database/prisma.js';
import { pageService } from '../pages/pages.service.js';
import { getSettingsMap } from '../settings/settings.module.js';
import { config } from '../../core/config/index.js';

/**
 * Server-rendered <head> for link-preview crawlers.
 *
 * The website is a Vue SPA: its real title and Open Graph tags are written by
 * `applySeo()` after the bundle boots and the page has been fetched. Social
 * scrapers (LINE, Facebook, Slack, …) do not run JavaScript — they read the
 * shipped `index.html`, which is why a shared link renders as the literal
 * shell title instead of the page. nginx routes those user agents here and we
 * answer with the same metadata the SPA would have produced.
 *
 * Search engines are deliberately NOT routed here: Google and Bing execute the
 * SPA, so sending them different markup would be cloaking for no benefit.
 */

export interface SharePreview {
  siteName: string;
  title: string;
  description: string;
  image: string;
  url: string;
  canonical: string;
  twitterCard: string;
  noIndex: boolean;
}

/**
 * Resolve the preview for a website path.
 *
 * Never throws: a preview is a best-effort decoration of a link, so an unknown
 * path or a database hiccup falls back to the site-wide SEO defaults rather
 * than turning a shared link into an error card.
 */
export async function buildSharePreview(rawPath: string): Promise<SharePreview> {
  const path = normalizePath(rawPath);
  const url = `${trimSlash(config.WEBSITE_URL)}${path === '/' ? '/' : path}`;

  const defaults = await loadDefaults();
  const base: SharePreview = {
    siteName: defaults.siteName || defaults.metaTitle || '',
    title: defaults.metaTitle || defaults.siteName || '',
    description: defaults.metaDescription || '',
    image: absoluteUrl(defaults.ogImage || ''),
    url,
    canonical: url,
    twitterCard: 'summary_large_image',
    noIndex: false,
  };

  const found = await resolveContent(path);
  if (!found) return base;

  const suffix = defaults.siteName && found.title ? ` | ${defaults.siteName}` : '';
  return {
    ...base,
    title: (found.ogTitle || found.metaTitle || found.title || base.title) + suffix,
    description:
      found.ogDescription || found.metaDescription || found.description || base.description,
    image: absoluteUrl(found.ogImage || found.image || '') || base.image,
    canonical: found.canonicalUrl || url,
    twitterCard: found.twitterCard || base.twitterCard,
    noIndex: found.noIndex ?? false,
  };
}

/** Fields any previewable record can supply; all optional. */
interface ContentSeo {
  title?: string | null;
  description?: string | null;
  image?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  canonicalUrl?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
  twitterCard?: string | null;
  noIndex?: boolean | null;
}

async function resolveContent(path: string): Promise<ContentSeo | null> {
  try {
    // Donation projects are the most-shared links and are not CMS pages, so
    // their route is matched before falling through to the page tree.
    const donation = /^\/donation\/([^/]+)\/?$/.exec(path);
    if (donation) {
      const project = await prisma.donationProject.findFirst({
        where: { slug: decodeURIComponent(donation[1]), isActive: true },
        select: {
          name: true,
          shortDescription: true,
          description: true,
          coverImage: true,
          bannerImage: true,
          metaTitle: true,
          metaDescription: true,
          ogImage: true,
        },
      });
      if (!project) return null;
      return {
        title: project.name,
        description: project.shortDescription || stripHtml(project.description),
        image: project.coverImage || project.bannerImage,
        metaTitle: project.metaTitle,
        metaDescription: project.metaDescription,
        ogImage: project.ogImage,
      };
    }

    const page = await pageService.getPublishedByPath(path);
    return {
      title: page.title,
      image: page.featuredImage || page.bannerImage,
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
      canonicalUrl: page.canonicalUrl,
      ogTitle: page.ogTitle,
      ogDescription: page.ogDescription,
      ogImage: page.ogImage,
      twitterCard: page.twitterCard,
      noIndex: page.noIndex,
    };
  } catch {
    // getPublishedByPath throws NotFoundError for unpublished/unknown paths, and
    // routes owned by the SPA alone (/game/…, /donate/status/…) always land here.
    return null;
  }
}

async function loadDefaults(): Promise<Record<string, string>> {
  try {
    const [seo, general] = await Promise.all([getSettingsMap('seo'), getSettingsMap('general')]);
    return { ...(seo as Record<string, string>), ...(general as Record<string, string>) };
  } catch {
    return {};
  }
}

/**
 * Render the crawler response.
 *
 * A body is included on purpose: several scrapers (and users who tap through a
 * preview before the redirect fires) treat an empty document as a dead link.
 * The refresh sends any real browser that reaches this endpoint to the SPA.
 */
export function renderSharePreview(p: SharePreview): string {
  const tags = [
    `<meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1.0" />`,
    `<title>${esc(p.title)}</title>`,
    p.description && `<meta name="description" content="${esc(p.description)}" />`,
    `<meta name="robots" content="${p.noIndex ? 'noindex,nofollow' : 'index,follow'}" />`,
    `<link rel="canonical" href="${esc(p.canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    p.siteName && `<meta property="og:site_name" content="${esc(p.siteName)}" />`,
    `<meta property="og:title" content="${esc(p.title)}" />`,
    p.description && `<meta property="og:description" content="${esc(p.description)}" />`,
    p.image && `<meta property="og:image" content="${esc(p.image)}" />`,
    p.image && `<meta property="og:image:secure_url" content="${esc(p.image)}" />`,
    `<meta property="og:url" content="${esc(p.url)}" />`,
    `<meta name="twitter:card" content="${esc(p.twitterCard)}" />`,
    `<meta name="twitter:title" content="${esc(p.title)}" />`,
    p.description && `<meta name="twitter:description" content="${esc(p.description)}" />`,
    p.image && `<meta name="twitter:image" content="${esc(p.image)}" />`,
    `<meta http-equiv="refresh" content="0; url=${esc(p.url)}" />`,
  ].filter(Boolean);

  return (
    `<!doctype html>\n<html lang="th">\n<head>\n${tags.map((t) => `  ${t}`).join('\n')}\n</head>\n` +
    `<body>\n  <h1>${esc(p.title)}</h1>\n` +
    (p.description ? `  <p>${esc(p.description)}</p>\n` : '') +
    `  <p><a href="${esc(p.url)}">${esc(p.url)}</a></p>\n</body>\n</html>\n`
  );
}

// ── helpers ─────────────────────────────────────────────────

function normalizePath(raw: string): string {
  if (!raw || !raw.startsWith('/')) return '/';
  // Drop the query string and any scheme/host someone appended; only the site
  // path selects content, and everything else is attacker-controlled input.
  const path = raw.split('?')[0].split('#')[0];
  if (path.includes('//')) return '/';
  return path.length > 1 ? path.replace(/\/+$/, '') || '/' : '/';
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Uploads are stored absolute, but a hand-typed relative path must still work. */
function absoluteUrl(url: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${trimSlash(config.APP_URL)}${url.startsWith('/') ? url : `/${url}`}`;
}

function stripHtml(html: string | null): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
