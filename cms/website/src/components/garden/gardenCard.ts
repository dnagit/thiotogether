/**
 * Text layout for the garden card — the picture a gardener saves of their plant.
 *
 * The card is one SVG, exported by the birthday card's plumbing (`svgToPng` in
 * `../birthday/wishCard.ts`), so this file only has to set words in lines. Thai has no spaces,
 * so lines break at word boundaries from `Intl.Segmenter`, or between characters without it.
 */
import { measureText } from '../birthday/wishCard';

export const GARDEN_CARD_WIDTH = 720;
export const GARDEN_CARD_HEIGHT = 1000;

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

/**
 * Lines of `text` no wider than `width` at `size`, at most `maxLines` of them — the last cut
 * with an ellipsis when the text runs on.
 */
export function wrapLines(
  text: string,
  size: number,
  width: number,
  maxLines: number,
  weight = '',
): string[] {
  const fits = (line: string) => measureText(line, size, weight) <= width;
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const piece of segments(paragraph)) {
      const candidate = line + piece;
      if (line && !fits(candidate.trimEnd())) {
        lines.push(line.trimEnd());
        line = piece.trimStart();
      } else {
        line = candidate;
      }
    }
    lines.push(line.trimEnd());
  }

  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.length > 1 && !fits(`${last}…`)) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

/** One line, shrunk to fit and then cut: for names, which may be sixty characters. */
export function fitLine(text: string, size: number, min: number, width: number, weight = '700') {
  let s = size;
  while (s > min && measureText(text, s, weight) > width) s -= 1;
  return { text: wrapLines(text, s, width, 1, weight)[0] ?? '', size: s };
}

/** Where a picture lands inside a box with `xMidYMax meet`: bottom-centred, fitted whole. */
export function fittedBox(
  aspect: number,
  box: { x: number; y: number; width: number; height: number },
) {
  const width = Math.min(box.width, box.height * aspect);
  const height = width / aspect;
  return { x: box.x + (box.width - width) / 2, y: box.y + box.height - height, width, height };
}
