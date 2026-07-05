import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import { BadRequestError } from '../errors/AppError.js';
import { config } from '../config/index.js';

const ALLOWED_MIME: Record<string, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
  video: ['video/mp4', 'video/webm'],
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

function makeUploader(mimes: string[]) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 10 },
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

/** Media library uploads: images, video, documents. */
export const uploadMedia = makeUploader(ALL_ALLOWED);

/** Donation slips: images only. */
export const uploadSlip = makeUploader(ALLOWED_MIME.image);

/** Generate an unguessable stored filename, preserving the extension. */
export function safeFileName(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase().slice(0, 10);
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
}
