import { createWorker } from 'tesseract.js';
import type { OcrProvider, OcrResult } from '../OcrProvider.js';

/** Offline OCR — no API key required. Default provider for development. */
export class TesseractProvider implements OcrProvider {
  readonly name = 'tesseract';

  async recognize(image: Buffer, _mimeType: string): Promise<OcrResult> {
    const worker = await createWorker(['eng', 'tha']);
    try {
      const { data } = await worker.recognize(image);
      return {
        text: data.text,
        confidence: (data.confidence ?? 0) / 100,
        raw: { confidence: data.confidence },
      };
    } finally {
      await worker.terminate();
    }
  }
}
