import type { PublicFoodTrail } from '@cms/shared';

/**
 * A fan's food-trail checklist as a picture to post: the trail's name, their account, how far
 * along they are, then each restaurant with its dishes ticked or not — drawn in a <canvas>.
 *
 * Text only: the restaurants' and dishes' pictures are the admin's and never reach the site.
 * Grows as tall as the trail needs; past what a phone's canvas can hold it is drawn smaller
 * rather than cut off.
 */

export interface ChecklistPicture {
  trail: PublicFoodTrail;
  account: string;
  places: Set<number>;
  menus: Set<number>;
  accent: string;
  /** Under everything, small — the site's address, say. */
  footer?: string;
}

const W = 1080;
const PAD = 56;
const CARD_PAD = 32;
const GAP = 20;
const FONT = '"Mali", sans-serif';
const INK = '#2b2118';
const MUTED = '#8a7a6c';
const BG = '#fff6ec';
const MAX_SIDE = 16000;
const MAX_AREA = 16_000_000;

/** Words to break between: Thai has no spaces, so the browser's word segmenter finds them. */
function pieces(text: string): string[] {
  const Seg = (Intl as any).Segmenter;
  if (Seg) return [...new Seg('th', { granularity: 'word' }).segment(text)].map((s: any) => s.segment);
  return [...text];
}

/** `text` broken into lines no wider than `max`. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = '';
    for (const piece of pieces(para)) {
      const next = line + piece;
      if (line && ctx.measureText(next).width > max) {
        out.push(line.trimEnd());
        line = piece.trimStart();
      } else {
        line = next;
      }
      // A single piece wider than the line (a long URL): split it by character.
      while (ctx.measureText(line).width > max && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > max) cut--;
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A box, filled with a white tick when `done`, outlined when not. */
function checkbox(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, done: boolean, accent: string): void {
  roundRect(ctx, x, y, size, size, size * 0.22);
  if (done) {
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = size * 0.14;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x + size * 0.24, y + size * 0.52);
    ctx.lineTo(x + size * 0.43, y + size * 0.7);
    ctx.lineTo(x + size * 0.77, y + size * 0.32);
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#cdbfb2';
    ctx.lineWidth = size * 0.09;
    ctx.stroke();
  }
}

/** What counts toward progress: every dish, and each restaurant that lists none. */
export function progress(trail: PublicFoodTrail, places: Set<number>, menus: Set<number>) {
  let total = 0;
  let done = 0;
  for (const p of trail.places) {
    if (p.menus.length) {
      total += p.menus.length;
      done += p.menus.filter((m) => menus.has(m.id)).length;
    } else {
      total += 1;
      if (places.has(p.id)) done += 1;
    }
  }
  return { total, done };
}

/**
 * Lays the picture out top to bottom, drawing as it goes when `draw` is set; returns the
 * height it took. Run once to measure, once more to draw at that height.
 */
function paint(ctx: CanvasRenderingContext2D, o: ChecklistPicture, draw: boolean): number {
  const inner = W - PAD * 2;
  const text = (s: string, x: number, y: number, align: CanvasTextAlign = 'left') => {
    if (!draw) return;
    ctx.textAlign = align;
    ctx.fillText(s, x, y);
  };
  ctx.textBaseline = 'top';
  let y = PAD;

  ctx.font = `700 64px ${FONT}`;
  ctx.fillStyle = o.accent;
  for (const line of wrap(ctx, o.trail.name, inner)) {
    text(line, W / 2, y, 'center');
    y += 82;
  }
  y += 6;
  ctx.font = `700 40px ${FONT}`;
  ctx.fillStyle = INK;
  for (const line of wrap(ctx, `@${o.account}`, inner)) {
    text(line, W / 2, y, 'center');
    y += 54;
  }

  // How far along: a line and a bar.
  const { total, done } = progress(o.trail, o.places, o.menus);
  y += 12;
  ctx.font = `600 32px ${FONT}`;
  ctx.fillStyle = INK;
  text(`กินแล้ว ${done}/${total}`, W / 2, y, 'center');
  y += 52;
  const barW = inner * 0.7;
  const barX = (W - barW) / 2;
  if (draw) {
    ctx.fillStyle = '#f1e2d3';
    roundRect(ctx, barX, y, barW, 22, 11);
    ctx.fill();
    if (done) {
      ctx.fillStyle = o.accent;
      roundRect(ctx, barX, y, Math.max(22, (barW * done) / Math.max(1, total)), 22, 11);
      ctx.fill();
    }
  }
  y += 22 + 36;

  const cardInner = inner - CARD_PAD * 2;
  const colGap = 28;
  const colW = (cardInner - colGap) / 2;
  const box = 32;

  o.trail.places.forEach((place, i) => {
    const visited = place.menus.length
      ? place.menus.some((m) => o.menus.has(m.id)) || o.places.has(place.id)
      : o.places.has(place.id);

    // Measure first, so the card's background goes under everything else.
    ctx.font = `700 38px ${FONT}`;
    const nameLines = wrap(ctx, `${i + 1}. ${place.name}`, cardInner - 56);
    ctx.font = `400 26px ${FONT}`;
    const noteLines = place.note ? wrap(ctx, place.note, cardInner - 56) : [];
    ctx.font = `600 30px ${FONT}`;
    const menuLines = place.menus.map((m) => wrap(ctx, m.name, colW - box - 14));
    // Two columns, filled row by row; a row is as tall as its taller dish.
    const rowHeights: number[] = [];
    for (let k = 0; k < menuLines.length; k += 2) {
      const n = Math.max(menuLines[k].length, menuLines[k + 1]?.length ?? 0);
      rowHeights.push(Math.max(box, n * 42) + 14);
    }
    const cardH =
      CARD_PAD * 2 +
      Math.max(44, nameLines.length * 50) +
      (noteLines.length ? 4 + noteLines.length * 36 : 0) +
      (rowHeights.length ? 18 + rowHeights.reduce((a, b) => a + b, 0) - 14 : 0);

    const x0 = PAD + CARD_PAD;
    let cy = y + CARD_PAD;
    if (draw) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.07)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = '#fff';
      roundRect(ctx, PAD, y, inner, cardH, 26);
      ctx.fill();
      ctx.restore();
      if (visited) {
        ctx.strokeStyle = o.accent;
        ctx.lineWidth = 4;
        roundRect(ctx, PAD + 2, y + 2, inner - 4, cardH - 4, 24);
        ctx.stroke();
      }
      checkbox(ctx, x0, cy + 4, 40, visited, o.accent);
    }
    ctx.font = `700 38px ${FONT}`;
    ctx.fillStyle = INK;
    nameLines.forEach((line, k) => text(line, x0 + 56, cy + k * 50));
    cy += Math.max(44, nameLines.length * 50);
    if (noteLines.length) {
      cy += 4;
      ctx.font = `400 26px ${FONT}`;
      ctx.fillStyle = MUTED;
      noteLines.forEach((line, k) => text(line, x0 + 56, cy + k * 36));
      cy += noteLines.length * 36;
    }

    if (menuLines.length) {
      cy += 18;
      ctx.font = `600 30px ${FONT}`;
      place.menus.forEach((menu, k) => {
        const row = Math.floor(k / 2);
        const rowY = cy + rowHeights.slice(0, row).reduce((a, b) => a + b, 0);
        const mx = x0 + (k % 2) * (colW + colGap);
        const eaten = o.menus.has(menu.id);
        if (!draw) return;
        checkbox(ctx, mx, rowY + 4, box, eaten, o.accent);
        ctx.fillStyle = eaten ? INK : MUTED;
        menuLines[k].forEach((line, n) => text(line, mx + box + 14, rowY + n * 42));
      });
    }

    y += cardH + GAP;
  });

  if (o.footer) {
    y += 10;
    ctx.font = `600 26px ${FONT}`;
    ctx.fillStyle = o.accent;
    text(o.footer, W / 2, y, 'center');
    y += 40;
  }
  return y + PAD - GAP;
}

/** The checklist as a PNG. */
export async function drawChecklist(o: ChecklistPicture): Promise<Blob> {
  // Mali is the site's own face, already linked from index.html; wait until it has arrived,
  // or the first picture is drawn in the fallback.
  await Promise.all(
    ['400', '600', '700'].map((w) => document.fonts.load(`${w} 32px "Mali"`, 'ก Aa').catch(() => [])),
  );
  const el = document.createElement('canvas');
  const ctx = el.getContext('2d')!;
  const H = Math.ceil(paint(ctx, o, false));
  const scale = Math.min(1, MAX_SIDE / H, Math.sqrt(MAX_AREA / (W * H)));
  el.width = Math.round(W * scale);
  el.height = Math.round(H * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  paint(ctx, o, true);
  const blob = await new Promise<Blob | null>((r) => el.toBlob(r, 'image/png'));
  if (!blob) throw new Error('Could not make the picture');
  return blob;
}
