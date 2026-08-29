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
    defaultProps: {
      title: 'Ready?',
      text: '',
      perRow: '1',
      marginTop: '',
      marginBottom: '2rem',
      buttons: [{ label: 'Get started', url: '#', image: '', hoverImage: '' }],
    },
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'text', label: 'Text', type: 'textarea' },
      {
        key: 'marginTop',
        label: 'Margin Top (blank = responsive overlap with the block above; a bare number means px)',
        type: 'text',
      },
      { key: 'marginBottom', label: 'Margin Bottom (blank = 2rem; a bare number means px)', type: 'text' },
      {
        key: 'perRow',
        label: 'Buttons per row (desktop — phones always swipe)',
        type: 'select',
        options: [
          { label: '1 per row', value: '1' },
          { label: '2 per row', value: '2' },
          { label: '3 per row', value: '3' },
          { label: '4 per row', value: '4' },
        ],
      },
      {
        key: 'buttons',
        label: 'Button',
        type: 'items',
        itemFields: [
          { key: 'label', label: 'Button Label', type: 'text' },
          { key: 'url', label: 'Button URL', type: 'url' },
          { key: 'image', label: 'Button Image (optional — replaces the text button)', type: 'image' },
          { key: 'hoverImage', label: 'Button Image on Hover (optional — needs the image above)', type: 'image' },
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
  {
    type: 'journey',
    label: 'Path to the Spotlight',
    icon: '🛤️',
    category: 'content',
    defaultProps: {
      heading: '',
      body: '',
      images: [],
      perView: 3,
      ratio: '4 / 3',
      autoplay: true,
      interval: 4,
      headingColor: '',
      textColor: '',
      background: '',
    },
    fields: [
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'body', label: 'Text (line breaks are kept)', type: 'textarea' },
      {
        key: 'images',
        label: 'Pictures',
        type: 'items',
        itemFields: [
          { key: 'url', label: 'Picture', type: 'image' },
          { key: 'caption', label: 'Caption (optional)', type: 'text' },
        ],
      },
      { key: 'perView', label: 'Pictures across on a desktop (1–5)', type: 'number' },
      {
        key: 'ratio',
        label: 'Picture shape',
        type: 'select',
        options: [
          { label: 'Landscape 4:3', value: '4 / 3' },
          { label: 'Square', value: '1 / 1' },
          { label: 'Portrait 3:4', value: '3 / 4' },
          { label: 'Wide 16:9', value: '16 / 9' },
        ],
      },
      { key: 'autoplay', label: 'Slide on its own', type: 'switch' },
      { key: 'interval', label: 'Seconds between slides', type: 'number' },
      { key: 'headingColor', label: 'Heading colour', type: 'color' },
      { key: 'textColor', label: 'Text colour', type: 'color' },
      { key: 'background', label: 'Background colour', type: 'color' },
    ],
  },
  {
    type: 'trophy-room',
    label: 'Trophy Room',
    icon: '🏆',
    category: 'content',
    defaultProps: {
      heading: '',
      entries: [],
      align: 'center',
      headingColor: '',
      textColor: '',
      background: '',
    },
    fields: [
      { key: 'heading', label: 'Heading', type: 'text' },
      {
        key: 'entries',
        label: 'Entries',
        type: 'items',
        itemFields: [
          {
            key: 'kind',
            label: 'Row type',
            type: 'select',
            options: [
              { label: 'Entry', value: 'entry' },
              { label: 'Group heading', value: 'group' },
            ],
          },
          { key: 'icon', label: 'Icon (optional — a dash is shown without one)', type: 'image' },
          { key: 'text', label: 'Text', type: 'textarea' },
        ],
      },
      {
        key: 'align',
        label: 'Alignment',
        type: 'select',
        options: [
          { label: 'Centre', value: 'center' },
          { label: 'Left', value: 'left' },
        ],
      },
      { key: 'headingColor', label: 'Heading colour', type: 'color' },
      { key: 'textColor', label: 'Text colour', type: 'color' },
      { key: 'background', label: 'Background colour', type: 'color' },
    ],
  },
  {
    type: 'profile-facts',
    label: 'Get to Know',
    icon: '🪪',
    category: 'content',
    defaultProps: {
      heading: '',
      image: '',
      imageSide: 'left',
      rows: [],
      headingColor: '',
      labelColor: '',
      textColor: '',
      background: '',
    },
    fields: [
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'image', label: 'Portrait', type: 'image' },
      {
        key: 'imageSide',
        label: 'Portrait side (on a desktop)',
        type: 'select',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Right', value: 'right' },
        ],
      },
      {
        key: 'rows',
        label: 'Facts',
        type: 'items',
        itemFields: [
          { key: 'label', label: 'Label (e.g. ชื่อเล่น) — no colon needed', type: 'text' },
          { key: 'value', label: 'Value', type: 'textarea' },
        ],
      },
      { key: 'headingColor', label: 'Heading colour', type: 'color' },
      { key: 'labelColor', label: 'Label colour', type: 'color' },
      { key: 'textColor', label: 'Text colour', type: 'color' },
      { key: 'background', label: 'Background colour', type: 'color' },
    ],
  },
  {
    type: 'projects',
    label: 'Projects',
    icon: '🗂️',
    category: 'content',
    defaultProps: { heading: '', columns: 3, limit: 0, showSummary: true, showDate: false },
    fields: [
      { key: 'heading', label: 'Heading above the grid (optional)', type: 'text' },
      { key: 'columns', label: 'Columns on a desktop (1–5)', type: 'number' },
      { key: 'limit', label: 'How many to show (0 = all)', type: 'number' },
      { key: 'showSummary', label: 'Show the summary under each title', type: 'switch' },
      { key: 'showDate', label: 'Show the date under each title', type: 'switch' },
    ],
  },
  {
    type: 'song',
    label: 'Song',
    icon: '🎵',
    category: 'media',
    defaultProps: {
      title: '',
      videoUrl: '',
      listen: [],
      creditsTitle: 'เครดิต',
      credits: '',
      lyricsTitle: 'เนื้อเพลง',
      lyrics: '',
      startOpen: false,
      headerColor: '#ffd966',
      headerTextColor: '#3b2a12',
      buttonColor: '#c9302c',
      cardColor: '#ffffff',
      borderColor: '#ffe9a3',
    },
    fields: [
      { key: 'title', label: 'Title bar (song — artist)', type: 'text' },
      {
        key: 'videoUrl',
        label: 'YouTube link',
        type: 'url',
      },
      {
        key: 'listen',
        label: 'Listen on… (streaming links)',
        type: 'items',
        itemFields: [
          { key: 'icon', label: 'Icon image', type: 'image' },
          { key: 'url', label: 'Link', type: 'url' },
          { key: 'label', label: 'Name (read out by screen readers)', type: 'text' },
        ],
      },
      { key: 'creditsTitle', label: 'Credits heading', type: 'text' },
      { key: 'credits', label: 'Credits (one per line)', type: 'textarea' },
      { key: 'lyricsTitle', label: 'Lyrics heading', type: 'text' },
      { key: 'lyrics', label: 'Lyrics (line breaks are kept)', type: 'textarea' },
      { key: 'startOpen', label: 'Open when the page loads', type: 'switch' },
      { key: 'headerColor', label: 'Title bar colour', type: 'color' },
      { key: 'headerTextColor', label: 'Title bar text colour', type: 'color' },
      { key: 'buttonColor', label: 'Round button colour', type: 'color' },
      { key: 'cardColor', label: 'Card colour', type: 'color' },
      { key: 'borderColor', label: 'Card border colour', type: 'color' },
    ],
  },
  {
    type: 'profile-card',
    label: 'Profile Poster',
    icon: '🌻',
    category: 'content',
    defaultProps: {
      ratio: '',
      maxWidth: 560,
      background: '#fffdf6',
      personHeight: 74,
      personX: 2,
      columnLeft: 27,
      columnRight: 5,
      columnTop: 3,
      columnBottom: 5,
      listIndent: 13,
      accent: '#ea480c',
      socialColor: '#d81906',
      cardRadius: 2.5,
      nameplateWidth: 52,
      pillColor: '#ffd341',
      pillTextColor: '#000000',
      pillShadowColor: '#e87627',
      textColor: '#3b2a12',
      cardColor: '#fff6ef',
      nameplateColor: '#f4a300',
      nameplateText: '',
      cardRows: [],
      socials: [],
      facts: [],
      traits: [],
      tags: [],
      decorations: [],
    },
    fields: [
      // ── The sheet ────────────────────────────────────────────────────────
      { key: 'frameImage', label: 'Frame + background (one image)', type: 'image' },
      { key: 'personImage', label: 'Cut-out photo (left)', type: 'image' },
      { key: 'personHeight', label: 'Cut-out height (% of the poster, e.g. 74)', type: 'number' },
      { key: 'personX', label: 'Cut-out distance from the left (%)', type: 'number' },
      { key: 'background', label: 'Paper colour behind the frame', type: 'color' },
      { key: 'ratio', label: 'Poster shape (leave empty to follow the frame image)', type: 'text' },
      { key: 'columnLeft', label: 'Text column — gap on the left (%)', type: 'number' },
      { key: 'columnRight', label: 'Text column — gap on the right (%)', type: 'number' },
      { key: 'columnTop', label: 'Text column — gap at the top (%)', type: 'number' },
      { key: 'columnBottom', label: 'Text column — gap at the bottom (%)', type: 'number' },
      { key: 'listIndent', label: 'Pills & badges — step in from the card (%)', type: 'number' },
      { key: 'maxWidth', label: 'Widest on desktop (px)', type: 'number' },

      // ── Details card ─────────────────────────────────────────────────────
      { key: 'cardImage', label: 'Card background image', type: 'image' },
      { key: 'cardColor', label: 'Card colour (behind the image)', type: 'color' },
      { key: 'cardPhoto', label: 'Card portrait', type: 'image' },
      {
        key: 'cardRows',
        label: 'Card details',
        type: 'items',
        itemFields: [
          { key: 'label', label: 'Label (e.g. NAME)', type: 'text' },
          { key: 'value', label: 'Value', type: 'text' },
        ],
      },
      { key: 'cardNote', label: 'Signature line under the card', type: 'text' },
      { key: 'cardLabelColor', label: 'Card label colour (NAME, FANCLUB…)', type: 'color' },
      { key: 'socialColor', label: 'Card frame & links bar colour', type: 'color' },
      { key: 'cardRadius', label: 'Card & bar corner rounding (% of the poster width)', type: 'number' },

      // ── Name plate ───────────────────────────────────────────────────────
      { key: 'nameplateImage', label: 'Name plate artwork', type: 'image' },
      { key: 'nameplateText', label: 'Name plate text (used if there is no artwork)', type: 'text' },
      { key: 'nameplateColor', label: 'Name plate colour', type: 'color' },
      { key: 'nameplateWidth', label: 'Name plate width (% of the text column)', type: 'number' },

      // ── Lists ────────────────────────────────────────────────────────────
      {
        key: 'socials',
        label: 'Social links',
        type: 'items',
        itemFields: [
          { key: 'icon', label: 'Icon', type: 'image' },
          { key: 'url', label: 'Link', type: 'url' },
          { key: 'label', label: 'Name (for screen readers)', type: 'text' },
        ],
      },
      {
        key: 'facts',
        label: 'Fact pills',
        type: 'items',
        itemFields: [
          { key: 'text', label: 'Text (e.g. HEIGHT : 205 CM)', type: 'text' },
          { key: 'icon', label: 'Icon (optional — a dot is used without one)', type: 'image' },
        ],
      },
      {
        key: 'traits',
        label: 'Round badges',
        type: 'items',
        itemFields: [
          { key: 'image', label: 'Picture', type: 'image' },
          { key: 'label', label: 'Caption', type: 'text' },
          { key: 'color', label: 'Colour', type: 'color' },
        ],
      },
      {
        key: 'tags',
        label: 'Bottom pills',
        type: 'items',
        itemFields: [
          { key: 'text', label: 'Text', type: 'text' },
          { key: 'icon', label: 'Icon (optional)', type: 'image' },
        ],
      },
      {
        key: 'decorations',
        label: 'Floating props (flower, drumstick, basketball…)',
        type: 'items',
        itemFields: [
          { key: 'image', label: 'Picture', type: 'image' },
          { key: 'x', label: 'Across (0–100, from the left)', type: 'number' },
          { key: 'y', label: 'Down (0–100, from the top)', type: 'number' },
          { key: 'size', label: 'Width (% of the poster)', type: 'number' },
          {
            key: 'motion',
            label: 'Movement',
            type: 'select',
            options: [
              { label: 'Still', value: 'none' },
              { label: 'Spin (basketball)', value: 'spin' },
              { label: 'Swing (drumstick)', value: 'swing' },
              { label: 'Float up and down', value: 'float' },
            ],
          },
          { key: 'speed', label: 'Seconds per loop', type: 'number' },
        ],
      },

      // ── Colours ──────────────────────────────────────────────────────────
      { key: 'accent', label: 'Accent (borders, captions)', type: 'color' },
      { key: 'pillColor', label: 'Pill colour', type: 'color' },
      { key: 'pillTextColor', label: 'Pill text colour', type: 'color' },
      { key: 'pillShadowColor', label: 'Pill shadow colour', type: 'color' },
      { key: 'textColor', label: 'Text colour', type: 'color' },
    ],
  },
];

export const blockByType = new Map(blockDefinitions.map((d) => [d.type, d]));
