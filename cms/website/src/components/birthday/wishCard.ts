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
/** Header, balloon and the gap before the message — everything above the wish text. */
const HEADER_HEIGHT = 500;
/** Signature, gift chip and date below the message. */
const FOOTER_HEIGHT = 190;
const MESSAGE_MAX_WIDTH = 560;
const MIN_CARD_HEIGHT = 900;

export const CARD_FONT =
  "'Sukhumvit Set', 'SukhumvitSet-Text', Sukhumvit, 'Noto Sans Thai', system-ui, sans-serif";

/** Longer wishes are set smaller, so a card never grows out of all proportion. */
function messageFontSize(length: number): number {
  if (length <= 80) return 34;
  if (length <= 180) return 28;
  return 24;
}

// One canvas, reused: creating one per measurement is the slow part of laying out text.
let measurer: CanvasRenderingContext2D | null = null;
function measure(text: string, font: string): number {
  measurer ??= document.createElement('canvas').getContext('2d');
  if (!measurer) return text.length * 12;
  measurer.font = font;
  return measurer.measureText(text).width;
}

/** Width of a run of card text, for placing things next to it rather than guessing. */
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
}

/** Wrap the message and work out how tall the card has to be to hold it. */
export function layoutCard(message: string): CardLayout {
  const fontSize = messageFontSize(message.length);
  const font = `${fontSize}px ${CARD_FONT}`;
  const lineHeight = Math.round(fontSize * 1.55);

  const lines: string[] = [];
  // Explicit newlines are the author's own breaks and are always honoured.
  for (const paragraph of message.split('\n')) {
    let line = '';
    for (const piece of segments(paragraph)) {
      const candidate = line + piece;
      if (line && measure(candidate.trimEnd(), font) > MESSAGE_MAX_WIDTH) {
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

  const blockHeight = lines.length * lineHeight;
  return {
    height: Math.max(MIN_CARD_HEIGHT, HEADER_HEIGHT + blockHeight + FOOTER_HEIGHT),
    fontSize,
    lineHeight,
    lines,
    messageTop: HEADER_HEIGHT + fontSize,
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

  const viewBox = (svg.getAttribute('viewBox') ?? '0 0 720 900').split(/\s+/).map(Number);
  const width = viewBox[2] || CARD_WIDTH;
  const height = viewBox[3] || MIN_CARD_HEIGHT;
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
