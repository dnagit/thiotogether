import type { SlipData } from './OcrProvider.js';

/**
 * Heuristic parser turning OCR text into structured slip data.
 * Tuned for Thai bank transfer slips (SCB, KBank, BBL, Krungthai, PromptPay)
 * but degrades gracefully — anything unparsed stays undefined and pushes the
 * donation into manual review instead of failing.
 */

const BANK_PATTERNS: Array<[RegExp, string]> = [
  [/(SCB|ไทยพาณิชย์|Siam Commercial)/i, 'SCB'],
  [/(K\s?PLUS|KBank|กสิกร|Kasikorn)/i, 'KBank'],
  [/(Bangkok Bank|กรุงเทพ|BBL|Bualuang)/i, 'Bangkok Bank'],
  [/(Krungthai|กรุงไทย|KTB)/i, 'Krungthai'],
  [/(Krungsri|กรุงศรี|BAY)/i, 'Krungsri'],
  [/(TTB|ทหารไทยธนชาต|TMBThanachart)/i, 'TTB'],
  [/(GSB|ออมสิน)/i, 'GSB'],
  [/(PromptPay|พร้อมเพย์)/i, 'PromptPay'],
];

// Words strongly indicating a transfer slip in TH/EN.
const SLIP_KEYWORDS =
  /(โอนเงิน|ชำระเงิน|สำเร็จ|transfer|payment|successful|amount|จำนวนเงิน|baht|บาท|reference|เลขที่รายการ|รหัสอ้างอิง)/i;

export function parseSlipText(text: string): SlipData {
  const normalized = text.replace(/ /g, ' ');
  const isSlip = SLIP_KEYWORDS.test(normalized) && /\d/.test(normalized);

  return {
    isSlip,
    bankName: matchBank(normalized),
    accountNumber: matchAccountNumber(normalized),
    amount: matchAmount(normalized),
    date: matchDate(normalized),
    time: matchTime(normalized),
    referenceNumber: matchReference(normalized),
  };
}

function matchBank(text: string): string | undefined {
  for (const [pattern, name] of BANK_PATTERNS) if (pattern.test(text)) return name;
  return undefined;
}

function matchAccountNumber(text: string): string | undefined {
  // Masked (xxx-x-x1234-x, XXX-XXX-1234) or plain 10-digit account formats.
  const masked = /(?:[xX*]{1,4}[- ]?){1,4}\d{3,4}(?:[- ]?[xX*\d]{1,4})?/.exec(text);
  if (masked) return masked[0].replace(/\s/g, '');
  const plain = /\b\d{3}[- ]?\d{1}[- ]?\d{5}[- ]?\d{1}\b/.exec(text);
  return plain?.[0].replace(/\s/g, '');
}

function matchAmount(text: string): number | undefined {
  // Prefer numbers near amount keywords; fall back to the largest decimal number.
  const near =
    /(?:amount|จำนวนเงิน|จำนวน)[^\d]{0,20}([\d,]+\.?\d{0,2})/i.exec(text) ??
    /([\d,]+\.\d{2})\s*(?:บาท|baht|THB)/i.exec(text);
  if (near) return toNumber(near[1]);

  const all = [...text.matchAll(/\b\d{1,3}(?:,\d{3})*\.\d{2}\b/g)].map((m) => toNumber(m[0]));
  if (all.length === 0) return undefined;
  return Math.max(...all.filter((n): n is number => n !== undefined));
}

function matchDate(text: string): string | undefined {
  // 04/07/2026, 04-07-26, 4 ก.ค. 2569, 4 Jul 2026
  const dmy = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/.exec(text);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    if (year > 2400) year -= 543; // Buddhist calendar
    return `${year}-${pad(dmy[2])}-${pad(dmy[1])}`;
  }
  const monthNames: Record<string, number> = {
    'ม.ค': 1, 'ก.พ': 2, 'มี.ค': 3, 'เม.ย': 4, 'พ.ค': 5, 'มิ.ย': 6,
    'ก.ค': 7, 'ส.ค': 8, 'ก.ย': 9, 'ต.ค': 10, 'พ.ย': 11, 'ธ.ค': 12,
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  const named = /\b(\d{1,2})\s*([ก-ฮ]{1,3}\.?[ก-ฮ]{1,3}\.?|[A-Za-z]{3})\.?\s*(\d{2,4})\b/.exec(text);
  if (named) {
    const key = named[2].toLowerCase().replace(/\.$/, '');
    const month = monthNames[key];
    if (month) {
      let year = Number(named[3]);
      if (year < 100) year += 2000;
      if (year > 2400) year -= 543;
      return `${year}-${pad(String(month))}-${pad(named[1])}`;
    }
  }
  return undefined;
}

function matchTime(text: string): string | undefined {
  const m = /\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b/.exec(text);
  return m ? `${pad(m[1])}:${m[2]}` : undefined;
}

function matchReference(text: string): string | undefined {
  const m =
    /(?:ref(?:erence)?(?:\s*no\.?)?|เลขที่รายการ|รหัสอ้างอิง|transaction id)[:\s#]*([A-Za-z0-9]{8,30})/i.exec(
      text,
    );
  return m?.[1];
}

function toNumber(s: string): number | undefined {
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function pad(s: string): string {
  return s.padStart(2, '0');
}
