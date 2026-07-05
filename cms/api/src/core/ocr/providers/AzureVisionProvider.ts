import { config } from '../../config/index.js';
import type { OcrProvider, OcrResult } from '../OcrProvider.js';

/** Azure AI Vision Read API (v4 image analysis). Needs endpoint + key. */
export class AzureVisionProvider implements OcrProvider {
  readonly name = 'azure-vision';

  constructor() {
    if (!config.AZURE_VISION_ENDPOINT || !config.AZURE_VISION_KEY) {
      throw new Error('OCR_PROVIDER=azure-vision requires AZURE_VISION_ENDPOINT and AZURE_VISION_KEY');
    }
  }

  async recognize(image: Buffer, mimeType: string): Promise<OcrResult> {
    const url = `${config.AZURE_VISION_ENDPOINT!.replace(/\/$/, '')}/computervision/imageanalysis:analyze?api-version=2024-02-01&features=read`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': config.AZURE_VISION_KEY!,
        'Content-Type': mimeType || 'application/octet-stream',
      },
      body: new Uint8Array(image),
    });
    if (!res.ok) throw new Error(`Azure Vision error ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as any;
    const blocks: any[] = json.readResult?.blocks ?? [];
    const lines = blocks.flatMap((b) => b.lines ?? []);
    const text = lines.map((l: any) => l.text).join('\n');
    const words = lines.flatMap((l: any) => l.words ?? []);
    const confidence =
      words.length > 0
        ? words.reduce((sum: number, w: any) => sum + (w.confidence ?? 0), 0) / words.length
        : 0;
    return { text, confidence, raw: json };
  }
}
