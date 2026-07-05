/** Raw OCR output: full text + provider-reported confidence (0..1). */
export interface OcrResult {
  text: string;
  confidence: number;
  raw: Record<string, unknown>;
}

/** Structured data parsed out of a bank-transfer slip. */
export interface SlipData {
  isSlip: boolean;
  bankName?: string;
  accountNumber?: string;
  amount?: number;
  date?: string; // as printed, normalized to YYYY-MM-DD when possible
  time?: string; // HH:mm
  referenceNumber?: string;
  qrPayload?: string;
}

/**
 * OCR abstraction (Strategy pattern). Drivers: tesseract (default, offline),
 * google-vision, aws-textract, azure-vision. Switch via OCR_PROVIDER env.
 */
export interface OcrProvider {
  readonly name: string;
  recognize(image: Buffer, mimeType: string): Promise<OcrResult>;
}
