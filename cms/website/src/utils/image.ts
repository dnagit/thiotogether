/**
 * Client-side preparation for visitor uploads.
 *
 * Two problems are solved before a picture ever reaches the API:
 *
 *  - **HEIC.** iPhones store photos as HEIC and picking one through Files hands it over
 *    untouched. Only Safari can display that, so everyone else would see a broken image.
 *    The phone itself can decode it, so the conversion happens here.
 *  - **Size.** A modern phone photo is 4–8 MB, and a balloon renders it a few hundred
 *    pixels wide. Downscaling first turns a slow upload on mobile data into an instant one.
 */

const MAX_EDGE = 1400;
const JPEG_QUALITY = 0.85;

/** The extension is checked as well as the MIME type: iOS reports an empty `type` for some files. */
export function isHeic(file: File): boolean {
  return /image\/hei[cf]/.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

export function isImageFile(file: File): boolean {
  // An empty `type` is not a rejection on its own — the extension check covers it.
  return !file.type || file.type.startsWith('image/') || isHeic(file);
}

/**
 * Decode, downscale and re-encode as JPEG. Returns the original file untouched when the
 * browser cannot decode it — the upload still goes through and only the size is missed.
 */
export async function prepareImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    // Already small and already a plain format: nothing to gain from a re-encode.
    if (scale === 1 && !isHeic(file) && /image\/(jpeg|png|webp)/.test(file.type)) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2d context');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob) throw new Error('canvas produced no blob');

    const name = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
