import { defineStore } from 'pinia';
import { get, post } from '@/api/client';
import type { Menu } from '@cms/shared';

/**
 * Global site state: settings, theme, menus. Loaded once on boot;
 * theme values are applied as CSS custom properties (no code changes to
 * restyle the site — everything flows from CMS settings).
 */
export const useSiteStore = defineStore('site', {
  state: () => ({
    settings: null as Record<string, any> | null,
    menus: {} as Record<string, Menu | null>,
    loaded: false,
  }),

  getters: {
    theme: (s) => (s.settings?.theme ?? {}) as Record<string, string>,
    siteName: (s) => (s.settings?.siteName as string) ?? '',
  },

  actions: {
    async init(): Promise<void> {
      if (this.loaded) return;
      this.settings = await get<Record<string, unknown>>('/settings');
      this.applyTheme();
      this.loaded = true;
      // Fire-and-forget visitor ping.
      void post('/visit', {}).catch(() => undefined);
    },

    async loadMenu(location: string): Promise<Menu | null> {
      if (this.menus[location] !== undefined) return this.menus[location];
      try {
        this.menus[location] = await get<Menu>(`/menus/${location}`);
      } catch {
        this.menus[location] = null;
      }
      return this.menus[location];
    },

    /**
     * Push the CMS theme onto the document as custom properties.
     *
     * A blank setting means "whatever the stylesheet says", not "unset it": every value here
     * has a default in `main.css`, and clearing a field in the admin is how an editor asks to
     * go back to it. Only a setting that actually holds something overwrites the sheet — which
     * is also what keeps a font changed in code from being silently undone by a value left
     * behind in the database from a previous one.
     */
    applyTheme(): void {
      const theme = this.theme;
      const root = document.documentElement;
      /** The setting if it carries a value, otherwise null — whitespace does not count. */
      const set = (key: string): string | null => {
        const value = typeof theme[key] === 'string' ? theme[key].trim() : '';
        return value || null;
      };

      const primary = set('primaryColor');
      if (primary) {
        root.style.setProperty('--color-primary', primary);
        root.style.setProperty('--color-primary-rgb', hexToRgb(primary));
      }
      const secondary = set('secondaryColor');
      if (secondary) {
        root.style.setProperty('--color-secondary', secondary);
        root.style.setProperty('--color-secondary-rgb', hexToRgb(secondary));
      }
      const font = set('fontFamily');
      if (font) root.style.setProperty('--font-family', font);
      if (set('faviconUrl')) {
        let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
        }
        link.href = set('faviconUrl') as string;
      }
    },
  },
});

function hexToRgb(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return '37 99 235';
  return `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}`;
}
