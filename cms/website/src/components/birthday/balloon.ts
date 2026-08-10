/**
 * Shapes, colours and geometry shared by every balloon on screen.
 *
 * One 100×100 box describes a balloon: the outline is both the visible body and the
 * clip for the visitor's photo, so a picture can never spill past the shape. Because
 * the editor preview and the wall render from these same numbers, what someone frames
 * while writing a wish is exactly what floats up afterwards.
 */

export type BalloonShapeId =
  | 'round'
  | 'long'
  | 'heart'
  | 'star'
  | 'gem'
  | 'sunflower'
  | 'dog'
  | 'cat';

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
    /*
     * Five points, outer radius 46 and inner 27, centred on (50, 52), with the tips eased
     * by 3.5 and the notches by 9.
     *
     * A textbook star sets the inner radius near 0.4 of the outer, which is handsome and
     * almost hollow: the spikes are all edge and no middle, and a photo clipped into one
     * loses its subject. At 0.59 there is half again as much of it to look at, and the
     * eased corners are what a foil star balloon does anyway.
     */
    path: 'M48.1 8.9 Q50 6 51.9 8.9 L60.9 22.6 Q65.9 30.2 74.6 32.5 L90.4 36.9 Q93.7 37.8 91.6 40.5 L81.3 53.3 Q75.7 60.3 76.1 69.3 L76.9 85.7 Q77 89.2 73.8 88 L58.4 82.2 Q50 79 41.6 82.2 L26.2 88 Q23 89.2 23.1 85.7 L23.9 69.3 Q24.3 60.3 18.7 53.3 L8.4 40.5 Q6.3 37.8 9.6 36.9 L25.4 32.5 Q34.1 30.2 39.1 22.6 Z',
    // Inside the notch between the two lower points — a string from a spike would read as
    // a sixth ray. Just above where the eased notch bottoms out, so the two meet cleanly.
    tie: { x: 50, y: 80 },
    knot: false,
  },
  {
    id: 'gem',
    label: 'เพชร',
    path: 'M50 3 L95 42 L50 99 L5 42 Z',
    tie: { x: 50, y: 98 },
    knot: true,
  },
  {
    id: 'sunflower',
    label: 'ทานตะวัน',
    /*
     * Twelve round petals around (50, 50): tips at radius 48, the notches between them at
     * 35, each petal a pair of quadratics whose controls sit level with the tip — that is
     * what gives a lobe rather than a spike, and a spiked one only repeats the star above.
     *
     * Twelve is even, so a petal lands at the very bottom and the string leaves from a tip
     * instead of a notch. The notches stop well short of the middle, so a photo clipped
     * into this still has a round face-sized area at the centre; the petals only scallop
     * its edge.
     */
    path: 'M40.9 16.2 Q40 3 50 2 Q60 3 59.1 16.2 Q64.8 4.3 74 8.4 Q82.1 14.3 74.7 25.3 Q85.7 17.9 91.6 26 Q95.7 35.2 83.8 40.9 Q97 40 98 50 Q97 60 83.8 59.1 Q95.7 64.8 91.6 74 Q85.7 82.1 74.7 74.7 Q82.1 85.7 74 91.6 Q64.8 95.7 59.1 83.8 Q60 97 50 98 Q40 97 40.9 83.8 Q35.2 95.7 26 91.6 Q17.9 85.7 25.3 74.7 Q14.3 82.1 8.4 74 Q4.3 64.8 16.2 59.1 Q3 60 2 50 Q3 40 16.2 40.9 Q4.3 35.2 8.4 26 Q14.3 17.9 25.3 25.3 Q17.9 14.3 26 8.4 Q35.2 4.3 40.9 16.2 Z',
    tie: { x: 50, y: 97 },
    knot: true,
  },
  {
    id: 'dog',
    label: 'น้องหมา',
    /*
     * A dog's head seen face-on: a round head with a drop ear hanging down each side, and
     * nothing below it — the head runs straight round to the chin.
     *
     * The head is deliberately narrower than the box. An ear can only read as an ear if it
     * hangs *outside* the head, and at full width there was no room left for one to hang in:
     * every earlier attempt merged into the skull and the whole thing read as a mushroom.
     * The other half of it is the notch. Each ear rejoins the cheek low, around y 66, so
     * between the ear's inner edge and the cheek there is a deep V; a shallow one reads as a
     * dent in the outline rather than as an ear in front of a head.
     *
     * The right half is written out and the left is its exact mirror, so the face cannot
     * come out lopsided.
     */
    path: 'M50 13 C60 13 67 16 71 22 C85 26 98 54 93 80 C89 91 78 92 76 82 C77 77 79 71 80 66 C79 82 64 93 50 93 C36 93 21 82 20 66 C21 71 23 77 24 82 C22 92 11 91 7 80 C2 54 15 26 29 22 C33 16 40 13 50 13 Z',
    tie: { x: 50, y: 92 },
    knot: true,
  },
  {
    id: 'cat',
    label: 'น้องแมว',
    /*
     * The cat is the dog's opposite where the two could be confused: both are a round head
     * and the ears are the entire difference. These stand up at the top corners, where the
     * dog's hang down the sides.
     *
     * The face is a real circle — centre (50, 55), radius 43 — and every arc of it is cut
     * from that circle with exact endpoints and tangents, so nothing here can quietly
     * flatten it into an egg. Only the ear is drawn by hand: it leaves the circle at a cusp
     * (the notch), curves up to a rounded tip, and comes back down an outer edge that meets
     * the cheek along the circle's own tangent, so the ear grows out of the head instead of
     * being stuck onto it. A straight-sided ear read as a horn; the curve is most of what
     * makes the face read as friendly rather than sharp.
     */
    path: 'M50 12 C56.5 12 63 13.5 68.8 16.4 C70.8 5.4 79 2 86 3 C91 4 87.4 27.1 91.7 44.6 C92.6 48 93 51.5 93 55 C93 78.7 73.7 98 50 98 C26.3 98 7 78.7 7 55 C7 51.5 7.4 48 8.3 44.6 C12.6 27.1 9 4 14 3 C21 2 29.2 5.4 31.2 16.4 C37 13.5 43.5 12 50 12 Z',
    tie: { x: 50, y: 97 },
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

/**
 * Party palette. The gift tag picks its own text colour per swatch (see {@link isLightColor}),
 * so a pale balloon is as usable as a dark one — white included, which needs nothing but a
 * firmer outline to read against the page.
 */
export const BALLOON_COLORS: readonly BalloonColor[] = [
  { label: 'แดง', hex: '#e11d48' },
  { label: 'ส้ม', hex: '#ea580c' },
  { label: 'เหลือง', hex: '#f4a300' },
  { label: 'เขียว', hex: '#16a34a' },
  { label: 'ฟ้า', hex: '#0ea5e9' },
  { label: 'น้ำเงิน', hex: '#4f46e5' },
  { label: 'ม่วง', hex: '#9333ea' },
  { label: 'ชมพู', hex: '#ec4899' },
  { label: 'ขาว', hex: '#ffffff' },
];

/** Red — the first swatch, and what a visitor gets if they never open the colour picker. */
export const DEFAULT_COLOR = BALLOON_COLORS[0].hex;

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
 * Where to draw the photo inside the 100×100 box, in box units.
 *
 * The picture is sized to *cover* the box at `zoom: 1` and then offset by the framing —
 * sized, not scaled through `preserveAspectRatio="slice"`. An SVG `<image>` establishes its
 * own viewport and clips to it, so a slice-fitted photo shifted sideways carries its clip
 * along and leaves a bare wedge of balloon behind it, which is not framing but tearing.
 * Given the element the size the picture actually occupies, the balloon's clip path does
 * the cropping and panning moves the photo *within* the shape, which is the point of it.
 *
 * Growing about the centre keeps zoom anchored on what the visitor is looking at.
 */
export function photoRect(
  aspect: number,
  framing: PhotoFraming,
): { x: number; y: number; width: number; height: number } {
  const { zoom, x, y } = clampFraming(framing);
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const width = 100 * Math.max(1, ratio) * zoom;
  const height = 100 * Math.max(1, 1 / ratio) * zoom;
  return { x: 50 - width / 2 + x, y: 50 - height / 2 + y, width, height };
}

/**
 * The exact panning range for one photo, in box units.
 *
 * Simply how far {@link photoRect} may slide before an edge of it enters the box: half of
 * whatever the picture overflows by. A landscape photo overflows sideways at 1× and can be
 * panned left and right straight away, while panning it up would expose the shape; zooming
 * in buys room on both axes.
 */
export function maxPan(aspect: number, zoom: number): { x: number; y: number } {
  if (!Number.isFinite(aspect) || aspect <= 0) return { x: 0, y: 0 };
  const { width, height } = photoRect(aspect, { zoom, x: 0, y: 0 });
  return { x: Math.max(0, (width - 100) / 2), y: Math.max(0, (height - 100) / 2) };
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

/**
 * The balloon's outline, knot and shadow side.
 *
 * A pale balloon is cut deeper than a saturated one: white taken down by the usual amount
 * is still white, and the shape would dissolve into the page behind it.
 */
export function outlineColor(hex: string): string {
  return darken(hex, isLightColor(hex) ? 0.34 : 0.22);
}

/**
 * The same colour taken far enough down to set text in. The greeting card tints its paper
 * from the balloon too, so a pale balloon has to yield ink that still reads on it.
 */
export function inkColor(hex: string): string {
  return darken(hex, isLightColor(hex) ? 0.55 : 0.22);
}
