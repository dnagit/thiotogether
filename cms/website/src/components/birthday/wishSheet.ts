/**
 * Every card on one picture: the "save all" of the cards page.
 *
 * The cards are drawn from the same SVG the page shows (see `svgToImage`), laid out in a grid
 * whose column count is picked so the whole sheet comes out landscape — near 16:9, the shape
 * a phone or a laptop screen shows whole.
 *
 * Two limits shape it:
 *
 *  - **Canvas size.** iOS Safari refuses a canvas over about 16.7 million pixels, and every
 *    browser caps a side at 16384. A wall of a few hundred wishes at full size is far past
 *    both, so the sheet is drawn at whatever scale fits: a big wall gives smaller cards.
 *  - **Memory.** Each card is a full SVG with photos in it, so the page mounts and draws them
 *    a batch at a time rather than all at once (`renderBatch`).
 */
import { CARD_FONT, CARD_HEIGHT, CARD_WIDTH, canvasToBlob, cachedInliner, svgToImage } from './wishCard';

/** The shape the sheet aims for. */
const TARGET_RATIO = 16 / 9;
/** Never narrower than this, even for one or two cards: the sheet is always landscape. */
const MIN_RATIO = 4 / 3;
/** Space between cards, and round the edge, in card units. */
const GAP = 40;
const PAD = 80;
/** The title band across the top, for a sheet up to five cards wide; wider ones scale it up. */
const HEADER = 200;
/** Under iOS Safari's 16,777,216-pixel canvas ceiling, with room to spare. */
const MAX_PIXELS = 16_000_000;
const MAX_SIDE = 16_000;
/** Sharper than the card units when the wall is small enough to allow it. */
const MAX_SCALE = 1.5;

export interface SheetGrid {
  cols: number;
  rows: number;
  /** In card units, before scaling. */
  width: number;
  height: number;
  /** Where the grid starts, so it sits centred when the sheet is widened to stay landscape. */
  left: number;
  /** How much larger than {@link HEADER} the title band is — a fixed title is a speck on a wide sheet. */
  headerScale: number;
}

/** The column count whose sheet comes nearest to {@link TARGET_RATIO}. */
export function sheetGrid(count: number): SheetGrid {
  const n = Math.max(1, count);
  let best: SheetGrid | null = null;
  let bestScore = Infinity;
  for (let cols = 1; cols <= n; cols += 1) {
    const rows = Math.ceil(n / cols);
    const headerScale = Math.max(1, cols / 5);
    // A last row more than half empty looks unfinished; a fuller layout wins over a closer ratio.
    const empty = (cols * rows - n) / cols;
    const gridW = cols * CARD_WIDTH + (cols - 1) * GAP;
    const height = rows * CARD_HEIGHT + (rows - 1) * GAP + 2 * PAD + HEADER * headerScale;
    const width = Math.max(gridW + 2 * PAD, Math.round(height * MIN_RATIO));
    const score = Math.abs(Math.log(width / height / TARGET_RATIO)) + (empty > 0.5 ? 0.3 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = { cols, rows, width, height, left: (width - gridW) / 2, headerScale };
    }
  }
  return best!;
}

export interface SheetOptions {
  count: number;
  title: string;
  subtitle?: string;
  /** Sheet background and the title's colour. */
  background: string;
  ink: string;
  /** Mounts cards `start` to `end - 1` and hands back their `<svg>` elements, in order. */
  renderBatch: (start: number, end: number) => Promise<SVGSVGElement[]>;
  onProgress?: (done: number) => void;
}

const BATCH = 8;

export async function drawWishSheet(options: SheetOptions): Promise<Blob> {
  const grid = sheetGrid(options.count);
  const scale = Math.min(
    MAX_SCALE,
    Math.sqrt(MAX_PIXELS / (grid.width * grid.height)),
    MAX_SIDE / grid.width,
    MAX_SIDE / grid.height,
  );

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(grid.width * scale);
  canvas.height = Math.round(grid.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.scale(scale, scale);

  ctx.fillStyle = options.background;
  ctx.fillRect(0, 0, grid.width, grid.height);

  ctx.fillStyle = options.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const k = grid.headerScale;
  ctx.font = `800 ${84 * k}px ${CARD_FONT}`;
  ctx.fillText(options.title, grid.width / 2, PAD + 84 * k, grid.width - 2 * PAD);
  if (options.subtitle) {
    ctx.font = `600 ${44 * k}px ${CARD_FONT}`;
    ctx.fillText(options.subtitle, grid.width / 2, PAD + 148 * k, grid.width - 2 * PAD);
  }

  const inline = cachedInliner();
  for (let start = 0; start < options.count; start += BATCH) {
    const end = Math.min(options.count, start + BATCH);
    const svgs = await options.renderBatch(start, end);
    for (let i = 0; i < svgs.length; i += 1) {
      const index = start + i;
      const col = index % grid.cols;
      const row = Math.floor(index / grid.cols);
      const cellX = grid.left + col * (CARD_WIDTH + GAP);
      const cellY = PAD + HEADER * grid.headerScale + row * (CARD_HEIGHT + GAP);
      try {
        const { image, width, height } = await svgToImage(svgs[i], inline);
        // A long wish makes a taller card; it is shrunk into the cell rather than overlapping
        // the row below.
        const fit = Math.min(CARD_WIDTH / width, CARD_HEIGHT / height);
        const w = width * fit;
        const h = height * fit;
        ctx.drawImage(image, cellX + (CARD_WIDTH - w) / 2, cellY + (CARD_HEIGHT - h) / 2, w, h);
      } catch {
        // One card that will not draw leaves a gap rather than losing the whole sheet.
      }
      options.onProgress?.(index + 1);
    }
  }

  // JPEG, not PNG: a sheet of photo-filled cards is several times smaller this way — the
  // difference between a picture a chat app will send and one it refuses.
  return canvasToBlob(canvas, 'image/jpeg', 0.9);
}
