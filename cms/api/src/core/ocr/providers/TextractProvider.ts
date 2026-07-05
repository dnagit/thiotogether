import { config } from '../../config/index.js';
import type { OcrProvider, OcrResult } from '../OcrProvider.js';

/**
 * AWS Textract DetectDocumentText. Reuses the S3 credential pair.
 * Imported lazily so the SDK is only loaded when this provider is selected.
 */
export class TextractProvider implements OcrProvider {
  readonly name = 'aws-textract';

  constructor() {
    if (!config.S3_ACCESS_KEY || !config.S3_SECRET_KEY) {
      throw new Error('OCR_PROVIDER=aws-textract requires S3_ACCESS_KEY / S3_SECRET_KEY');
    }
  }

  async recognize(image: Buffer, _mimeType: string): Promise<OcrResult> {
    const { TextractClient, DetectDocumentTextCommand } = await import('@aws-sdk/client-textract');
    const client = new TextractClient({
      region: config.S3_REGION,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY!,
        secretAccessKey: config.S3_SECRET_KEY!,
      },
    });
    const out = await client.send(
      new DetectDocumentTextCommand({ Document: { Bytes: new Uint8Array(image) } }),
    );
    const lines = (out.Blocks ?? []).filter((b) => b.BlockType === 'LINE');
    const text = lines.map((l) => l.Text ?? '').join('\n');
    const confidence =
      lines.length > 0
        ? lines.reduce((sum, l) => sum + (l.Confidence ?? 0), 0) / lines.length / 100
        : 0;
    return { text, confidence, raw: { blocks: out.Blocks?.length } };
  }
}
