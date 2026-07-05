import { config } from '../config/index.js';
import type { OcrProvider } from './OcrProvider.js';
import { TesseractProvider } from './providers/TesseractProvider.js';
import { GoogleVisionProvider } from './providers/GoogleVisionProvider.js';
import { AzureVisionProvider } from './providers/AzureVisionProvider.js';
import { TextractProvider } from './providers/TextractProvider.js';

let instance: OcrProvider | null | undefined;

/** Factory + singleton. Returns null when OCR is disabled (OCR_PROVIDER=none). */
export function getOcrProvider(): OcrProvider | null {
  if (instance !== undefined) return instance;
  switch (config.OCR_PROVIDER) {
    case 'google-vision':
      instance = new GoogleVisionProvider();
      break;
    case 'azure-vision':
      instance = new AzureVisionProvider();
      break;
    case 'aws-textract':
      instance = new TextractProvider();
      break;
    case 'none':
      instance = null;
      break;
    default:
      instance = new TesseractProvider();
  }
  return instance;
}

export { parseSlipText } from './slipParser.js';
export type { OcrProvider, OcrResult, SlipData } from './OcrProvider.js';
