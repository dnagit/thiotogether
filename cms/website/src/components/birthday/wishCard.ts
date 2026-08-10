/**
 * Layout maths and export plumbing for the greeting card.
 *
 * The card is one SVG, rendered on screen and rasterised to PNG from that same element —
 * so the picture someone saves is the card they were looking at, not a second drawing of
 * it that can drift out of step.
 *
 * Two problems this file exists to solve:
 *
 *  - **Wrapping Thai.** Thai is written without spaces, so splitting on whitespace puts a
 *    300-character wish on one line. `Intl.Segmenter` at word granularity does dictionary
 *    -based segmentation for Thai, which is exactly the break opportunity we need; where
 *    it is missing we fall back to breaking between grapheme clusters, which is ugly but
 *    never overflows.
 *  - **Tainted canvases.** Photos are served from the API origin. Drawing one straight
 *    into a canvas would taint it and make `toBlob` throw, so every remote image is
 *    fetched and inlined as a data URI first.
 */

export const CARD_WIDTH = 720;
/** 4:5 — the aspect of `images/bg-card.png`, so the artwork is never stretched to fit. */
export const CARD_HEIGHT = 900;

/**
 * The card, in card units: a white leaf laid on the artwork, with the wish written down its
 * left side and the chosen picture filling the right.
 *
 * These are one table rather than numbers spread through the template, because they only
 * make sense against each other — the writing column ends where the picture begins, and both
 * sit inside the leaf.
 */
export const CARD_LEAF = { x: 40, y: 205, width: 640, height: 590, radius: 26 } as const;
export const CARD_PICTURE = { x: 272, y: 240, width: 382, height: 490, radius: 18 } as const;
/**
 * The writing column: the message band, then the signature rows beneath it.
 *
 * Deliberately the narrower half — the picture is what the card is looked at for, and the
 * wish reads down the side of it. What that costs is type size: the message is set to
 * whatever fits this width (see {@link MESSAGE_SIZES}), so widening the picture further
 * would start shrinking the writing rather than the column.
 */
export const CARD_COLUMN = {
  x: 70,
  width: 178,
  /** The present, sitting at the head of the column. */
  giftSize: 150,
  giftY: 232,
  top: 395,
  bottom: 730,
} as const;

/**
 * The signature, which follows the last line of the wish rather than sitting on the bottom
 * of the column — it is who wrote the words above, and a gap between them reads as a
 * caption for the card instead. The pair is centred in the band as one block.
 */
export const CARD_NAME = { size: 26, gap: 18 } as const;

/**
 * Sizes to try for the message, largest first.
 *
 * The column is a third of the card wide, so the size has to be found rather than picked
 * from the length: the same 200 characters that fit at 22 on one card wrap to two more
 * lines on the next. Only if even the smallest overflows does the card grow taller.
 */
const MESSAGE_SIZES = [22, 20, 18, 16, 14] as const;

export const CARD_FONT =
  "'Sukhumvit Set', 'SukhumvitSet-Text', Sukhumvit, 'Noto Sans Thai', system-ui, sans-serif";

// One canvas, reused: creating one per measurement is the slow part of laying out text.
let measurer: CanvasRenderingContext2D | null = null;
function measure(text: string, font: string): number {
  measurer ??= document.createElement('canvas').getContext('2d');
  if (!measurer) return text.length * 12;
  measurer.font = font;
  return measurer.measureText(text).width;
}

/** Width of a run of card text, for sizing things around it rather than guessing. */
export function measureText(text: string, fontSize: number, weight = ''): number {
  return measure(text, `${weight} ${fontSize}px ${CARD_FONT}`.trim());
}

/**
 * Break opportunities in reading order. For Thai these are word boundaries; for scripts
 * that use spaces the segmenter yields the spaces too, which works out the same.
 */
function segments(text: string): string[] {
  const Segmenter = (Intl as any).Segmenter;
  if (typeof Segmenter === 'function') {
    try {
      const seg = new Segmenter(['th', 'en'], { granularity: 'word' });
      return [...seg.segment(text)].map((s: any) => s.segment as string);
    } catch {
      // Fall through to the character split below.
    }
  }
  return [...text];
}

export interface CardLayout {
  height: number;
  fontSize: number;
  lineHeight: number;
  lines: string[];
  /** Baseline y of the first message line. */
  messageTop: number;
  /** Baseline y of the signature, one line below the last of them. */
  nameY: number;
  /**
   * How far past the bottom of the writing column the message ran, and so how much taller
   * the card is than {@link CARD_HEIGHT}. Everything anchored low — the leaf, the picture,
   * the signature — moves down by this, which is what keeps the parts in step on the rare
   * card that has to grow.
   */
  overflow: number;
}

/** Break one paragraph's worth of text into lines that fit `width`. */
function wrap(text: string, font: string, width: number): string[] {
  const lines: string[] = [];
  // Explicit newlines are the author's own breaks and are always honoured.
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const piece of segments(paragraph)) {
      const candidate = line + piece;
      if (line && measure(candidate.trimEnd(), font) > width) {
        lines.push(line.trimEnd());
        // A break opportunity that is itself a space would otherwise start the next
        // line with a stray indent.
        line = piece.trimStart();
      } else {
        line = candidate;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/** Set the message in the writing column, as large as it will go. */
export function layoutCard(message: string): CardLayout {
  const band = CARD_COLUMN.bottom - CARD_COLUMN.top;
  /** What the signature adds under the last line: its own line, plus air above it. */
  const signature = CARD_NAME.gap + CARD_NAME.size;

  let fontSize = MESSAGE_SIZES[MESSAGE_SIZES.length - 1];
  let lineHeight = Math.round(fontSize * 1.5);
  let lines: string[] = [];
  for (const size of MESSAGE_SIZES) {
    fontSize = size;
    lineHeight = Math.round(size * 1.5);
    lines = wrap(message, `${size}px ${CARD_FONT}`, CARD_COLUMN.width);
    if (lines.length * lineHeight + signature <= band) break;
  }

  const block = lines.length * lineHeight + signature;
  const overflow = Math.max(0, block - band);
  // Centred in the band rather than hung from the top of it: most wishes are a line or two,
  // and those would otherwise sit up by the fold with the rest of the column empty.
  const messageTop = CARD_COLUMN.top + fontSize + Math.max(0, band - block) / 2;
  return {
    height: CARD_HEIGHT + overflow,
    fontSize,
    lineHeight,
    lines,
    messageTop,
    nameY: messageTop + (lines.length - 1) * lineHeight + CARD_NAME.gap + CARD_NAME.size,
    overflow,
  };
}

// ── Export ──────────────────────────────────────────────────

/**
 * Fetch a remote image and return it as a data URI.
 *
 * Returns null rather than throwing: a card whose photo could not be inlined is still
 * worth saving, and the SVG simply renders without it.
 */
async function inlineImage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Rasterise a live `<svg>` element to a PNG blob at `scale`× its layout size.
 *
 * The element is cloned first: every remote `href` in the clone is swapped for a data URI,
 * because an SVG loaded into an `<img>` is an isolated document that is not allowed to
 * fetch anything of its own.
 */
export async function svgToPng(svg: SVGSVGElement, scale = 2): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement;

  const viewBox = (svg.getAttribute('viewBox') ?? `0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`)
    .split(/\s+/)
    .map(Number);
  const width = viewBox[2] || CARD_WIDTH;
  const height = viewBox[3] || CARD_HEIGHT;
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  await Promise.all(
    [...clone.querySelectorAll('image')].map(async (node) => {
      const href = node.getAttribute('href') ?? node.getAttribute('xlink:href');
      if (!href || href.startsWith('data:')) return;
      const inlined = await inlineImage(href);
      if (inlined) node.setAttribute('href', inlined);
      else node.remove();
    }),
  );

  const source = new XMLSerializer().serializeToString(clone);
  // `encodeURIComponent` rather than base64: it handles the Thai text in the markup
  // without a UTF-8 round trip through `btoa`, which only accepts latin1.
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;

  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('card svg failed to rasterise'));
    image.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d context');
  // Cards are saved and re-shared, so a flat white backing is better than the
  // transparency that would otherwise turn black in some chat apps.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas produced no blob'))),
      'image/png',
    );
  });
}

/** Filename-safe slice of a name; `\p{M}` keeps Thai vowel signs and tone marks attached. */
export function cardFileName(name: string): string {
  const safe = name.replace(/[^\p{L}\p{N}\p{M}\-_]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `wish-${safe || 'card'}.png`;
}
