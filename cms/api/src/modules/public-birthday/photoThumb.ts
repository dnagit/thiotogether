import sharp from 'sharp';
import { getStorage } from '../../core/storage/index.js';
import { logger } from '../../core/logger.js';

/**
 * The small copy of a wish photo that the balloon wall draws.
 *
 * The wall is the one screen that holds every photo of an event at once. A balloon is a
 * hundred-odd CSS pixels wide there, but the browser decodes whatever it is handed: a
 * 1400px upload costs about 8 MB of bitmap however small it is painted, so a phone showing
 * a couple of hundred wishes runs out of memory and the tab reloads — the "a problem
 * repeatedly occurred" page. A 640px WebP costs about a twentieth of that.
 *
 * Only the wall uses it. The card behind a balloon opens one photo at a time and keeps the
 * original, so nothing anyone looks at closely is downscaled.
 */

/**
 * Longest edge of the stored thumbnail.
 *
 * The balloon is at most {@link MAX_BALLOON_W} (180px) across on a desktop, and the framing
 * may zoom the picture up to 3×, so a retina screen at full zoom could use rather more than
 * this. 640 covers the ordinary case — any phone, and a desktop up to about 1.8× zoom —
 * without giving back the memory this exists to save.
 */
const THUMB_EDGE = 640;

/** Sizes a wish photo down for the wall. Null when the picture could not be decoded. */
export async function makePhotoThumb(
  buffer: Buffer,
  /** Storage key of the original, whose name the thumbnail borrows. */
  originalKey: string,
): Promise<string | null> {
  try {
    const thumb = await sharp(buffer, { failOn: 'none' })
      // Honours the EXIF orientation an iPhone writes rather than re-encoding it away:
      // `rotate()` with no argument bakes the tag in, which WebP output would otherwise drop.
      .rotate()
      .resize(THUMB_EDGE, THUMB_EDGE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    const key = `${originalKey.replace(/\.[^./]+$/, '')}-thumb.webp`;
    const stored = await getStorage().put(thumb, key, 'image/webp');
    return stored.url;
  } catch (err) {
    // Never fatal: a wish with no thumbnail falls back to its original on the wall, which
    // is how every row written before this column existed behaves anyway.
    logger.warn({ err, originalKey }, 'birthday photo thumbnail generation failed');
    return null;
  }
}
