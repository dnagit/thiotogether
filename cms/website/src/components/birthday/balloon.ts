/**
 * Shapes, colours and geometry shared by every balloon on screen.
 *
 * One 100×100 box describes a balloon: the outline is both the visible body and the
 * clip for the visitor's photo, so a picture can never spill past the shape. Because
 * the editor preview and the wall render from these same numbers, what someone frames
 * while writing a wish is exactly what floats up afterwards.
 */

export type BalloonShapeId = 'round' | 'long' | 'heart' | 'star' | 'gem';

export interface BalloonShape {
  id: BalloonShapeId;
  label: string;
  /** Body outline in the 100×100 box. */
  path: string;
  /** Where the string leaves the balloon, in the same box. */
  tie: { x: number; y: number };
  /**
   * Whether to draw the little knot at the tie. Off where the tie sits inside the outline
   * rather than on its lowest point — a knot there reads as a speck on the balloon instead
   * of a knot under it.
   */
  knot: boolean;
}

export const BALLOON_SHAPES: readonly BalloonShape[] = [
  {
    id: 'round',
    label: 'กลม',
    path: 'M50 2 C22 2 6 24 6 46 C6 68 26 88 50 98 C74 88 94 68 94 46 C94 24 78 2 50 2 Z',
    tie: { x: 50, y: 97 },
    knot: true,
  },
  {
    id: 'long',
    label: 'รี',
    path: 'M50 2 C29 2 17 22 17 48 C17 74 33 92 50 98 C67 92 83 74 83 48 C83 22 71 2 50 2 Z',
    tie: { x: 50, y: 97 },
    knot: true,
  },
  {
    id: 'heart',
    label: 'หัวใจ',
    path: 'M50 98 C50 98 6 66 6 36 C6 18 20 6 34 6 C42 6 48 10 50 16 C52 10 58 6 66 6 C80 6 94 18 94 36 C94 66 50 98 50 98 Z',
    tie: { x: 50, y: 96 },
    knot: true,
  },
  {
    id: 'star',
    label: 'ดาว',
    // Five points: outer radius 46, inner 19, centred on (50, 52).
    path: 'M50 6 L61.2 36.6 L93.8 37.8 L68.1 57.9 L77 89.2 L50 71 L23 89.2 L31.9 57.9 L6.2 37.8 L38.8 36.6 Z',
    // The notch between the two lower points — a string from a spike would read as a sixth ray.
    tie: { x: 50, y: 71 },
    knot: false,
  },
  {
    id: 'gem',
    label: 'เพชร',
    path: 'M50 3 L95 42 L50 99 L5 42 Z',
    tie: { x: 50, y: 98 },
    knot: true,
  },
];

export function shapeById(id: string | null | undefined): BalloonShape {
  return BALLOON_SHAPES.find((s) => s.id === id) ?? BALLOON_SHAPES[0];
}

let uidSeq = 0;
/**
 * A prefix for one balloon's SVG ids. Those live in a document-global namespace, so two
 * balloons sharing a `clipPath` id would both be clipped to whichever rendered last.
 */
export function nextBalloonUid(): string {
  return `balloon-${++uidSeq}`;
}

export interface BalloonColor {
  label: string;
  hex: string;
}

/** Party palette. Every entry is dark enough for white text to stay readable on the gift tag. */
export const BALLOON_COLORS: readonly BalloonColor[] = [
  { label: 'แดง', hex: '#e11d48' },
  { label: 'ส้ม', hex: '#ea580c' },
  { label: 'เหลือง', hex: '#f4a300' },
  { label: 'เขียว', hex: '#16a34a' },
  { label: 'ฟ้า', hex: '#0ea5e9' },
  { label: 'น้ำเงิน', hex: '#4f46e5' },
  { label: 'ม่วง', hex: '#9333ea' },
  { label: 'ชมพู', hex: '#ec4899' },
];

export const DEFAULT_COLOR = BALLOON_COLORS[4].hex;

/**
 * How the uploaded picture sits inside the balloon.
 *
 * `x`/`y` are offsets in box units — the box is 100 wide, so they double as percentages.
 * A photo is drawn cover-first, so `zoom: 1` with no offset already fills the shape;
 * framing only decides *which* part of it shows.
 */
export interface PhotoFraming {
  zoom: number;
  x: number;
  y: number;
}

export const DEFAULT_FRAMING: Readonly<PhotoFraming> = { zoom: 1, x: 0, y: 0 };

/**
 * `maxOffset` is deliberately loose. A panoramic photo at 3× can legitimately travel
 * several box-widths, so this bounds nonsense rather than framing the picture — the
 * editor's own limit is the one a visitor feels.
 */
export const FRAMING_LIMITS = { minZoom: 1, maxZoom: 3, maxOffset: 200 } as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * A coarse sanity bound, not the editor's rule.
 *
 * How far a photo can travel before an empty edge appears depends on its aspect ratio,
 * which only the editor knows — it clamps precisely while the visitor drags (see
 * {@link maxPan}). This exists so a hand-edited or corrupt value coming back from the API
 * cannot push a picture clean off its balloon.
 */
export function clampFraming(framing: Partial<PhotoFraming> | null | undefined): PhotoFraming {
  const { minZoom, maxZoom, maxOffset } = FRAMING_LIMITS;
  return {
    zoom: clamp(Number(framing?.zoom ?? 1) || 1, minZoom, maxZoom),
    x: clamp(Number(framing?.x ?? 0) || 0, -maxOffset, maxOffset),
    y: clamp(Number(framing?.y ?? 0) || 0, -maxOffset, maxOffset),
  };
}

/**
 * The exact panning range for one photo, in box units.
 *
 * A photo is drawn cover-first, so it already overflows the 100×100 box on its long axis
 * even at 1× — a landscape picture can slide sideways straight away, while sliding it up
 * would expose the shape. Solving the cover geometry for "no edge enters the box" gives
 * `50 · (ratio · zoom − 1)` per axis, where `ratio` is that axis' share of the overflow.
 */
export function maxPan(
  naturalWidth: number,
  naturalHeight: number,
  zoom: number,
): { x: number; y: number } {
  if (!naturalWidth || !naturalHeight) return { x: 0, y: 0 };
  const aspect = naturalWidth / naturalHeight;
  return {
    x: Math.max(0, 50 * (Math.max(1, aspect) * zoom - 1)),
    y: Math.max(0, 50 * (Math.max(1, 1 / aspect) * zoom - 1)),
  };
}

/**
 * SVG transform placing the photo. Scaling happens about the centre of the box so
 * zooming stays anchored to what the visitor is looking at rather than the top-left.
 */
export function framingTransform(framing: PhotoFraming): string {
  const { zoom, x, y } = clampFraming(framing);
  return `translate(${(x + 50).toFixed(2)} ${(y + 50).toFixed(2)}) scale(${zoom.toFixed(3)}) translate(-50 -50)`;
}

// ── Colour helpers ──────────────────────────────────────────
// The balloon needs a lighter crown and a darker knot than the chosen colour. These are
// computed rather than written as `color-mix()`, because an SVG `stop-color` fed an
// unsupported value falls back to black instead of ignoring the stop.

function parseHex(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value.padEnd(6, '0').slice(0, 6);
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0,
  ];
}

function toHex(rgb: number[]): string {
  return `#${rgb.map((c) => clamp(Math.round(c), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

/** Mix towards white. `amount` 0 → unchanged, 1 → white. */
export function lighten(hex: string, amount: number): string {
  return toHex(parseHex(hex).map((c) => c + (255 - c) * amount));
}

/** Mix towards black. */
export function darken(hex: string, amount: number): string {
  return toHex(parseHex(hex).map((c) => c * (1 - amount)));
}

/** True when white text on this colour would be hard to read (used for the gift tag). */
export function isLightColor(hex: string): boolean {
  const [r, g, b] = parseHex(hex);
  // Rec. 709 luma — closer to perceived brightness than a plain average.
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.65;
}
