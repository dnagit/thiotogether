import {
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { config } from '../config/index.js';
import type { StorageProvider, StoredFile } from './StorageProvider.js';

/** Works with AWS S3, MinIO, DigitalOcean Spaces, Cloudflare R2 (S3-compatible). */
export class S3StorageProvider implements StorageProvider {
  readonly name = 's3';
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    if (!config.S3_BUCKET || !config.S3_ACCESS_KEY || !config.S3_SECRET_KEY) {
      throw new Error('S3 storage selected but S3_BUCKET / S3_ACCESS_KEY / S3_SECRET_KEY missing');
    }
    this.bucket = config.S3_BUCKET;
    this.client = new S3Client({
      region: config.S3_REGION,
      endpoint: config.S3_ENDPOINT || undefined,
      forcePathStyle: !!config.S3_ENDPOINT, // required by MinIO & most non-AWS providers
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY,
        secretAccessKey: config.S3_SECRET_KEY,
      },
    });
  }

  async put(buffer: Buffer, key: string, contentType: string): Promise<StoredFile> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ACL: 'public-read',
      }),
    );
    return { key, url: this.urlFor(key) };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  urlFor(key: string): string {
    if (config.S3_PUBLIC_URL) return `${config.S3_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
    if (config.S3_ENDPOINT) return `${config.S3_ENDPOINT.replace(/\/$/, '')}/${this.bucket}/${key}`;
    return `https://${this.bucket}.s3.${config.S3_REGION}.amazonaws.com/${key}`;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }
}
