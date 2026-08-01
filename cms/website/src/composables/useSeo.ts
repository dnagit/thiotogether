import type { SeoMeta } from '@cms/shared';
import { useSiteStore } from '@/stores/site';

/**
 * Apply SEO metadata to the document head: title, description, canonical,
 * Open Graph, Twitter Card, JSON-LD. Falls back to the CMS SEO defaults.
 */
export function applySeo(seo: SeoMeta & { title?: string }): void {
  const site = useSiteStore();
  const defaults = (site.settings?.seoDefaults ?? {}) as Record<string, string>;

  const title = seo.metaTitle || seo.title || defaults.metaTitle || site.siteName;
  const description = seo.metaDescription || defaults.metaDescription || '';
  const ogImage = absoluteUrl(seo.ogImage || defaults.ogImage || '');

  document.title = title;
  setMeta('description', description);
  setMeta('robots', seo.noIndex ? 'noindex,nofollow' : 'index,follow');

  setLink('canonical', seo.canonicalUrl || window.location.href);

  setProperty('og:title', seo.ogTitle || title);
  setProperty('og:description', seo.ogDescription || description);
  // An empty og:image is worse than none: scrapers treat the tag as present and
  // show a blank thumbnail instead of falling back to the shell's default.
  if (ogImage) setProperty('og:image', ogImage);
  setProperty('og:url', window.location.href);
  setProperty('og:type', 'website');

  setMeta('twitter:card', seo.twitterCard || 'summary_large_image');
  setMeta('twitter:title', title);
  setMeta('twitter:description', description);
  if (ogImage) setMeta('twitter:image', ogImage);

  setJsonLd(seo.jsonLd ?? null);
}

/**
 * Open Graph requires an absolute URL: a scraper reads the tag out of the
 * document and has no page to resolve `/uploads/x.jpg` against. Uploads are
 * usually stored absolute, but a hand-typed path in the CMS must still work.
 * The base is the site origin, which is what `<img src>` resolves against
 * everywhere else in the app.
 */
function absoluteUrl(url: string): string {
  if (!url) return '';
  try {
    return new URL(url, window.location.origin).href;
  } catch {
    // A malformed value must not take the rest of the head down with it.
    return '';
  }
}

function setMeta(name: string, content: string): void {
  let el = document.querySelector<HTMLMetaElement>(`meta[name='${name}']`);
  if (!el) {
    el = document.createElement('meta');
    el.name = name;
    document.head.appendChild(el);
  }
  el.content = content;
}

function setProperty(property: string, content: string): void {
  let el = document.querySelector<HTMLMetaElement>(`meta[property='${property}']`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', property);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setLink(rel: string, href: string): void {
  let el = document.querySelector<HTMLLinkElement>(`link[rel='${rel}']`);
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

function setJsonLd(data: Record<string, unknown> | null): void {
  const id = 'cms-jsonld';
  document.getElementById(id)?.remove();
  if (!data) return;
  const script = document.createElement('script');
  script.id = id;
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}
