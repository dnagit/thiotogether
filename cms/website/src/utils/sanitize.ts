/**
 * Minimal HTML sanitizer for CMS-authored rich text: strips script/style
 * elements, event handlers, and javascript: URLs. Content authors are
 * trusted admins, so this is defense in depth rather than the primary
 * boundary; swap in DOMPurify if untrusted authors are ever allowed.
 */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  doc.querySelectorAll('script, style, iframe[src^="javascript:"], object, embed').forEach((el) => el.remove());

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  const elements: Element[] = [];
  while (walker.nextNode()) elements.push(walker.currentNode as Element);

  for (const el of elements) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith('on') || ((name === 'href' || name === 'src') && value.startsWith('javascript:'))) {
        el.removeAttribute(attr.name);
      }
    }
  }
  return doc.body.innerHTML;
}
