import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import { BadRequestError } from '../errors/AppError.js';
import { config } from '../config/index.js';

const ALLOWED_MIME: Record<string, string[]> = {
  /**
   * HEIC/HEIF are accepted because that is what an iPhone stores; the donation form converts
   * them to JPEG on the device before uploading, so these only arrive when that conversion
   * could not run. Note the bundled libvips decodes AVIF but not HEVC-coded HEIC, so such a
   * file is stored as-is: no thumbnail, and only Safari can display it.
   */
  image: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'image/heic',
    'image/heif',
    'image/heic-sequence',
    'image/heif-sequence',
  ],
  /**
   * MP4 and WebM are what every browser plays. QuickTime is here because that is what an
   * iPhone hands over, and its usual H.264 payload plays in Chrome and Safari alike — an
   * uploader is far better served by the odd clip Firefox cannot decode than by being told
   * their video "is not allowed" for a container difference they never chose.
   */
  video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
  document: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
};

const ALL_ALLOWED = Object.values(ALLOWED_MIME).flat();
// Extensions that must never be stored regardless of declared MIME type.
const FORBIDDEN_EXT = /\.(php|phtml|exe|sh|bat|cmd|js|mjs|html?|svgz)$/i;

function makeUploader(mimes: string[], maxMb: number = config.MAX_UPLOAD_MB) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024, files: 10 },
    fileFilter: (_req, file, cb) => {
      if (!mimes.includes(file.mimetype)) {
        cb(new BadRequestError(`File type ${file.mimetype} is not allowed`));
        return;
      }
      if (FORBIDDEN_EXT.test(file.originalname)) {
        cb(new BadRequestError('File extension is not allowed'));
        return;
      }
      cb(null, true);
    },
  });
}

/** Media library uploads: images, video, documents — video gets the larger ceiling. */
export const uploadMedia = makeUploader(ALL_ALLOWED, config.MAX_MEDIA_UPLOAD_MB);

/** Donation slips: images only. */
export const uploadSlip = makeUploader(ALLOWED_MIME.image);

/** Generate an unguessable stored filename, preserving the extension. */
export function safeFileName(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase().slice(0, 10);
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
}
