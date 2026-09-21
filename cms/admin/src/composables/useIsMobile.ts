import { useMediaQuery } from '@vueuse/core';

/**
 * Whether the admin is on a phone-sized screen — the width at which the layout swaps its
 * sidebar for a drawer and list pages swap their tables for cards. One breakpoint for the
 * whole admin, so every page changes shape at the same width.
 */
export const MOBILE_QUERY = '(max-width: 768px)';

export function useIsMobile() {
  return useMediaQuery(MOBILE_QUERY);
}
