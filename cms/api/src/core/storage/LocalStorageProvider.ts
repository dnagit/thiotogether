import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/index.js';
import type { StorageProvider, StoredFile } from './StorageProvider.js';

/** Stores files under UPLOAD_DIR; served statically by Express at /uploads. */
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';
  private readonly baseDir = path.resolve(process.cwd(), config.UPLOAD_DIR);

  async put(buffer: Buffer, key: string, _contentType: string): Promise<StoredFile> {
    const filePath = this.resolveSafe(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
    return { key, url: this.urlFor(key) };
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolveSafe(key));
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  urlFor(key: string): string {
    return `${config.APP_URL}/uploads/${key}`;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      await fs.access(this.baseDir);
      return true;
    } catch {
      return false;
    }
  }

  /** Prevent path traversal — resolved path must stay inside baseDir. */
  private resolveSafe(key: string): string {
    const filePath = path.resolve(this.baseDir, key);
    if (!filePath.startsWith(this.baseDir + path.sep)) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return filePath;
  }
}
