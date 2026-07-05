export interface StoredFile {
  /** Storage key (relative path inside the driver). */
  key: string;
  /** Publicly reachable URL. */
  url: string;
}

/**
 * Storage abstraction (Strategy pattern). Drivers: LocalStorageProvider,
 * S3StorageProvider. Switching is a config change (STORAGE_DRIVER), never a
 * code change.
 */
export interface StorageProvider {
  readonly name: string;
  put(buffer: Buffer, key: string, contentType: string): Promise<StoredFile>;
  delete(key: string): Promise<void>;
  /** Resolve a stored key to a public URL. */
  urlFor(key: string): string;
  healthCheck(): Promise<boolean>;
}
