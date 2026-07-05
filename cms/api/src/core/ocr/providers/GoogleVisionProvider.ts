import { config } from '../../config/index.js';
import type { OcrProvider, OcrResult } from '../OcrProvider.js';

/** Google Cloud Vision via REST — TEXT_DETECTION. Needs GOOGLE_VISION_API_KEY. */
export class GoogleVisionProvider implements OcrProvider {
  readonly name = 'google-vision';

  constructor() {
    if (!config.GOOGLE_VISION_API_KEY) {
      throw new Error('OCR_PROVIDER=google-vision requires GOOGLE_VISION_API_KEY');
    }
  }

  async recognize(image: Buffer, _mimeType: string): Promise<OcrResult> {
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${config.GOOGLE_VISION_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: image.toString('base64') },
              features: [{ type: 'TEXT_DETECTION' }],
            },
          ],
        }),
      },
    );
    if (!res.ok) throw new Error(`Google Vision error ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as any;
    const annotation = json.responses?.[0]?.fullTextAnnotation;
    const pageConfidence: number = annotation?.pages?.[0]?.confidence ?? 0.9;
    return {
      text: annotation?.text ?? '',
      confidence: pageConfidence,
      raw: json.responses?.[0] ?? {},
    };
  }
}
