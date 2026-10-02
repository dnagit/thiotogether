import { plainTextToHtml } from '@cms/shared';
import { sanitizeHtml } from './sanitize';

/**
 * Text from the admin as HTML that looks the way it was written: the editor's HTML as it is,
 * and older plain text with its line breaks kept (see `plainTextToHtml`).
 */
export function textToHtml(text: string | null | undefined): string {
  const html = plainTextToHtml(text);
  return html ? sanitizeHtml(html) : '';
}
