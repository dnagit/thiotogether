/**
 * Block catalog for the page builder. Each entry describes:
 *  - defaultProps: what a freshly added block contains
 *  - fields: how the props editor renders (data-driven — no per-block editor components)
 *
 * Adding a new block to the CMS:
 *  1. website: create components/blocks/<Type>Block.vue (auto-registered)
 *  2. admin: add one entry here so editors can configure it
 * No other code changes anywhere.
 */

export type FieldType =
  | 'text'
  | 'textarea'
  | 'richtext'
  | 'number'
  | 'image'
  | 'url'
  | 'color'
  | 'switch'
  | 'select'
  | 'items';

export interface BlockField {
  key: string;
  label: string;
  type: FieldType;
  options?: Array<{ label: string; value: string }>;
  /** For type 'items': the shape of each row. */
  itemFields?: BlockField[];
}

export interface BlockDefinition {
  type: string;
  label: string;
  icon: string;
  category: 'content' | 'media' | 'layout' | 'interactive';
  defaultProps: Record<string, unknown>;
  fields: BlockField[];
}

export const blockDefinitions: BlockDefinition[] = [
  {
    type: 'hero',
    label: 'Hero',
    icon: '🦸',
    category: 'content',
    defaultProps: { headline: 'Headline', subheadline: '', image: '', ctaLabel: '', ctaUrl: '' },
    fields: [
      { key: 'headline', label: 'Headline', type: 'text' },
      { key: 'subheadline', label: 'Sub-headline', type: 'textarea' },
      { key: 'image', label: 'Background Image', type: 'image' },
      { key: 'ctaLabel', label: 'Button Label', type: 'text' },
      { key: 'ctaUrl', label: 'Button URL', type: 'url' },
    ],
  },
  {
    type: 'banner',
    label: 'Banner',
    icon: '🏳️',
    category: 'content',
    defaultProps: { title: 'Title', subtitle: '', image: '' },
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'text' },
      { key: 'image', label: 'Background Image', type: 'image' },
    ],
  },
  {
    type: 'rich-text',
    label: 'Rich Text',
    icon: '📝',
    category: 'content',
    defaultProps: { html: '<p>Your content…</p>' },
    fields: [{ key: 'html', label: 'Content (HTML)', type: 'richtext' }],
  },
  {
    type: 'text',
    label: 'Text',
    icon: '🔤',
    category: 'content',
    defaultProps: { text: 'Plain text', align: 'left' },
    fields: [
      { key: 'text', label: 'Text', type: 'textarea' },
      {
        key: 'align', label: 'Alignment', type: 'select',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Center', value: 'center' },
          { label: 'Right', value: 'right' },
        ],
      },
    ],
  },
  {
    type: 'image',
    label: 'Image',
    icon: '🖼️',
    category: 'media',
    defaultProps: { src: '', alt: '', caption: '', rounded: true },
    fields: [
      { key: 'src', label: 'Image', type: 'image' },
      { key: 'alt', label: 'Alt Text', type: 'text' },
      { key: 'caption', label: 'Caption', type: 'text' },
      { key: 'rounded', label: 'Rounded Corners', type: 'switch' },
    ],
  },
  {
    type: 'gallery',
    label: 'Gallery',
    icon: '🎞️',
    category: 'media',
    defaultProps: { images: [], columns: 3 },
    fields: [
      {
        key: 'images', label: 'Images', type: 'items',
        itemFields: [
          { key: 'src', label: 'Image', type: 'image' },
          { key: 'alt', label: 'Alt', type: 'text' },
        ],
      },
      { key: 'columns', label: 'Columns', type: 'number' },
    ],
  },
  {
    type: 'slider',
    label: 'Slider',
    icon: '🎠',
    category: 'media',
    defaultProps: { slides: [], autoplay: true, interval: 5000 },
    fields: [
      {
        key: 'slides', label: 'Slides', type: 'items',
        itemFields: [
          { key: 'image', label: 'Image', type: 'image' },
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'text', label: 'Text', type: 'text' },
          { key: 'url', label: 'Link URL', type: 'url' },
        ],
      },
      { key: 'autoplay', label: 'Autoplay', type: 'switch' },
      { key: 'interval', label: 'Interval (ms)', type: 'number' },
    ],
  },
  {
    type: 'video',
    label: 'Video',
    icon: '🎬',
    category: 'media',
    defaultProps: { url: '', title: '' },
    fields: [
      { key: 'url', label: 'Video URL (YouTube/Vimeo/mp4)', type: 'url' },
      { key: 'title', label: 'Title', type: 'text' },
    ],
  },
  {
    type: 'faq',
    label: 'FAQ',
    icon: '❓',
    category: 'interactive',
    defaultProps: { title: 'FAQ', items: [] },
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      {
        key: 'items', label: 'Questions', type: 'items',
        itemFields: [
          { key: 'question', label: 'Question', type: 'text' },
          { key: 'answer', label: 'Answer', type: 'textarea' },
        ],
      },
    ],
  },
  {
    type: 'cards',
    label: 'Cards',
    icon: '🃏',
    category: 'layout',
    defaultProps: { title: '', items: [], columns: 3 },
    fields: [
      { key: 'title', label: 'Section Title', type: 'text' },
      {
        key: 'items', label: 'Cards', type: 'items',
        itemFields: [
          { key: 'image', label: 'Image', type: 'image' },
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'text', label: 'Text', type: 'textarea' },
          { key: 'url', label: 'Link', type: 'url' },
        ],
      },
      { key: 'columns', label: 'Columns', type: 'number' },
    ],
  },
  {
    type: 'features',
    label: 'Features',
    icon: '✨',
    category: 'layout',
    defaultProps: { title: '', items: [] },
    fields: [
      { key: 'title', label: 'Section Title', type: 'text' },
      {
        key: 'items', label: 'Features', type: 'items',
        itemFields: [
          { key: 'icon', label: 'Icon (emoji)', type: 'text' },
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'text', label: 'Text', type: 'textarea' },
        ],
      },
    ],
  },
  {
    type: 'cta',
    label: 'Call to Action',
    icon: '📢',
    category: 'content',
    defaultProps: { title: 'Ready?', text: '', buttons: [{ label: 'Get started', url: '#', image: '' }] },
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'text', label: 'Text', type: 'textarea' },
      {
        key: 'buttons',
        label: 'Button',
        type: 'items',
        itemFields: [
          { key: 'label', label: 'Button Label', type: 'text' },
          { key: 'url', label: 'Button URL', type: 'url' },
          { key: 'image', label: 'Button Image (optional — replaces the text button)', type: 'image' },
        ],
      },
    ],
  },
  {
    type: 'pricing',
    label: 'Pricing',
    icon: '💲',
    category: 'layout',
    defaultProps: { title: 'Pricing', plans: [] },
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      {
        key: 'plans', label: 'Plans', type: 'items',
        itemFields: [
          { key: 'name', label: 'Plan Name', type: 'text' },
          { key: 'price', label: 'Price', type: 'text' },
          { key: 'features', label: 'Features (one per line)', type: 'textarea' },
          { key: 'url', label: 'Button URL', type: 'url' },
          { key: 'highlighted', label: 'Highlighted', type: 'switch' },
        ],
      },
    ],
  },
  {
    type: 'team',
    label: 'Team',
    icon: '👥',
    category: 'layout',
    defaultProps: { title: 'Our Team', members: [] },
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      {
        key: 'members', label: 'Members', type: 'items',
        itemFields: [
          { key: 'photo', label: 'Photo', type: 'image' },
          { key: 'name', label: 'Name', type: 'text' },
          { key: 'role', label: 'Role', type: 'text' },
        ],
      },
    ],
  },
  {
    type: 'testimonials',
    label: 'Testimonials',
    icon: '💬',
    category: 'content',
    defaultProps: { title: '', items: [] },
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      {
        key: 'items', label: 'Testimonials', type: 'items',
        itemFields: [
          { key: 'quote', label: 'Quote', type: 'textarea' },
          { key: 'author', label: 'Author', type: 'text' },
          { key: 'role', label: 'Role/Company', type: 'text' },
          { key: 'avatar', label: 'Avatar', type: 'image' },
        ],
      },
    ],
  },
  {
    type: 'timeline',
    label: 'Timeline',
    icon: '🕰️',
    category: 'content',
    defaultProps: { title: '', items: [] },
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      {
        key: 'items', label: 'Milestones', type: 'items',
        itemFields: [
          { key: 'date', label: 'Date', type: 'text' },
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'text', label: 'Text', type: 'textarea' },
        ],
      },
    ],
  },
  {
    type: 'google-map',
    label: 'Google Map',
    icon: '🗺️',
    category: 'interactive',
    defaultProps: { lat: 13.7563, lng: 100.5018, zoom: 14 },
    fields: [
      { key: 'lat', label: 'Latitude', type: 'number' },
      { key: 'lng', label: 'Longitude', type: 'number' },
      { key: 'zoom', label: 'Zoom', type: 'number' },
    ],
  },
  {
    type: 'contact-form',
    label: 'Contact Form',
    icon: '✉️',
    category: 'interactive',
    defaultProps: { formSlug: 'contact', title: '' },
    fields: [
      { key: 'formSlug', label: 'Form Slug', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
    ],
  },
  {
    type: 'html',
    label: 'Custom HTML',
    icon: '</>',
    category: 'content',
    defaultProps: { html: '' },
    fields: [{ key: 'html', label: 'HTML', type: 'richtext' }],
  },
  {
    type: 'divider',
    label: 'Divider',
    icon: '➖',
    category: 'layout',
    defaultProps: {},
    fields: [],
  },
  {
    type: 'spacer',
    label: 'Spacer',
    icon: '␣',
    category: 'layout',
    defaultProps: { height: '4rem' },
    fields: [{ key: 'height', label: 'Height (CSS)', type: 'text' }],
  },
];

export const blockByType = new Map(blockDefinitions.map((d) => [d.type, d]));
