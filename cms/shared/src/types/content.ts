import type { BaseEntity, SeoMeta } from './api.js';
import type { PublishStatus, MenuItemType, BlockType } from '../constants/enums.js';

/** A single builder block placed on a page. */
export interface PageBlock extends BaseEntity {
  pageId: number;
  /** Component key, e.g. 'hero'. Open set — see BlockType for defaults. */
  type: BlockType | string;
  /** Component-specific props (headline, items, src, …). */
  props: Record<string, unknown>;
  /** Visual overrides: background, padding, text color, custom class. */
  styles: BlockStyles;
  /** Behavioral settings: visibility, container width, anchor id. */
  settings: BlockSettings;
  sortOrder: number;
}

export interface BlockStyles {
  background?: string;
  textColor?: string;
  paddingTop?: string;
  paddingBottom?: string;
  customClass?: string;
}

export interface BlockSettings {
  anchorId?: string;
  fullWidth?: boolean;
  hidden?: boolean;
  hiddenOnMobile?: boolean;
}

export interface Page extends BaseEntity, SeoMeta {
  title: string;
  slug: string;
  /** Materialized URL path, e.g. /services/mobile-development/flutter */
  path: string;
  parentId?: number | null;
  parent?: Page | null;
  children?: Page[];
  featuredImage?: string | null;
  bannerImage?: string | null;
  status: PublishStatus;
  publishedAt?: string | null;
  sortOrder: number;
  isHome: boolean;
  blocks?: PageBlock[];
}

export interface PageTreeNode {
  id: number;
  title: string;
  slug: string;
  path: string;
  status: PublishStatus;
  sortOrder: number;
  children: PageTreeNode[];
}

export interface Menu extends BaseEntity {
  name: string;
  /** Stable key the website queries by, e.g. 'main', 'footer'. */
  location: string;
  isActive: boolean;
  items?: MenuItem[];
}

export interface MenuItem extends BaseEntity {
  menuId: number;
  parentId?: number | null;
  label: string;
  icon?: string | null;
  type: MenuItemType;
  /** For PAGE type. */
  pageId?: number | null;
  /** Resolved/explicit URL depending on type. */
  url?: string | null;
  target: '_self' | '_blank';
  sortOrder: number;
  isActive: boolean;
  children?: MenuItem[];
}

export interface MediaItem extends BaseEntity {
  fileName: string;
  originalName: string;
  mimeType: string;
  type: string;
  size: number;
  url: string;
  thumbnailUrl?: string | null;
  folder: string;
  width?: number | null;
  height?: number | null;
  alt?: string | null;
  uploadedById?: number | null;
}

export interface Setting extends BaseEntity {
  key: string;
  value: unknown;
  group: string;
}

/** Strongly-typed view over the settings key/value store. */
export interface SiteSettings {
  siteName: string;
  siteDescription: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: string;
  socialLinks: Partial<Record<'facebook' | 'twitter' | 'instagram' | 'youtube' | 'line', string>>;
  analyticsId?: string;
  seoDefaults: SeoMeta;
  theme: ThemeSettings;
}

export interface ThemeSettings {
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string;
  faviconUrl: string;
  fontFamily: string;
  headerStyle: 'default' | 'transparent' | 'compact';
  footerText: string;
}
