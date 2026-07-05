import { config } from '../config/index.js';
import type { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { S3StorageProvider } from './S3StorageProvider.js';

let instance: StorageProvider | null = null;

/** Factory + singleton. Driver chosen by STORAGE_DRIVER env. */
export function getStorage(): StorageProvider {
  if (!instance) {
    instance = config.STORAGE_DRIVER === 's3' ? new S3StorageProvider() : new LocalStorageProvider();
  }
  return instance;
}

export type { StorageProvider, StoredFile } from './StorageProvider.js';
