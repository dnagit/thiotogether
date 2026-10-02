import { sanitizeHtml } from './sanitize';

/** Tags that already lay text out in blocks; text using them keeps its own layout. */
const BLOCK_TAG = /<\/?(p|div|br|h[1-6]|ul|ol|li|table|blockquote|pre|section|figure)\b/i;

/**
 * Turns text from an admin textarea into HTML that looks the way it was typed.
 *
 * Most editors type plain text, where HTML would collapse every line break into a space. So
 * unless the text already lays itself out with block tags, a blank line starts a new paragraph
 * and a single line break stays a line break. Inline tags such as `<b>` or `<a>` still work.
 */
export function textToHtml(text: string | null | undefined): string {
  const src = (text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!src) return '';
  if (BLOCK_TAG.test(src)) return sanitizeHtml(src);
  const html = src
    .split(/\n\s*\n/)
    .map((para) => `<p>${para.trim().replace(/\n/g, '<br>')}</p>`)
    .join('');
  return sanitizeHtml(html);
}
