/** Publication status shared by pages, projects, menus. */
export const PublishStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type PublishStatus = (typeof PublishStatus)[keyof typeof PublishStatus];

export const RoleName = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  EDITOR: 'EDITOR',
} as const;
export type RoleName = (typeof RoleName)[keyof typeof RoleName];

export const DonationStatus = {
  PENDING: 'PENDING',
  AUTO_VERIFIED: 'AUTO_VERIFIED',
  VERIFIED: 'VERIFIED',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;
export type DonationStatus = (typeof DonationStatus)[keyof typeof DonationStatus];

/** Statuses that count toward a project's raised amount. */
export const COUNTED_DONATION_STATUSES: DonationStatus[] = [DonationStatus.VERIFIED];

export const MenuItemType = {
  PAGE: 'PAGE',
  EXTERNAL: 'EXTERNAL',
  CATEGORY: 'CATEGORY',
  ANCHOR: 'ANCHOR',
  CUSTOM: 'CUSTOM',
} as const;
export type MenuItemType = (typeof MenuItemType)[keyof typeof MenuItemType];

export const FormFieldType = {
  TEXT: 'TEXT',
  NUMBER: 'NUMBER',
  EMAIL: 'EMAIL',
  PHONE: 'PHONE',
  DATE: 'DATE',
  TIME: 'TIME',
  SELECT: 'SELECT',
  RADIO: 'RADIO',
  CHECKBOX: 'CHECKBOX',
  TEXTAREA: 'TEXTAREA',
  UPLOAD: 'UPLOAD',
} as const;
export type FormFieldType = (typeof FormFieldType)[keyof typeof FormFieldType];

export const MediaType = {
  IMAGE: 'IMAGE',
  VIDEO: 'VIDEO',
  PDF: 'PDF',
  DOCUMENT: 'DOCUMENT',
} as const;
export type MediaType = (typeof MediaType)[keyof typeof MediaType];

/** Block types shipped by default. The renderer is open — any string is a valid type
 *  as long as a component is registered for it. */
export const BlockType = {
  HERO: 'hero',
  BANNER: 'banner',
  RICH_TEXT: 'rich-text',
  TEXT: 'text',
  IMAGE: 'image',
  GALLERY: 'gallery',
  SLIDER: 'slider',
  VIDEO: 'video',
  FAQ: 'faq',
  CARDS: 'cards',
  FEATURES: 'features',
  CTA: 'cta',
  PRICING: 'pricing',
  TEAM: 'team',
  TESTIMONIALS: 'testimonials',
  TIMELINE: 'timeline',
  GOOGLE_MAP: 'google-map',
  CONTACT_FORM: 'contact-form',
  HTML: 'html',
  DIVIDER: 'divider',
  SPACER: 'spacer',
} as const;
export type BlockType = (typeof BlockType)[keyof typeof BlockType];
