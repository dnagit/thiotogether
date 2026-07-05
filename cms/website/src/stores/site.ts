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

    applyTheme(): void {
      const theme = this.theme;
      const root = document.documentElement;
      if (theme.primaryColor) {
        root.style.setProperty('--color-primary', theme.primaryColor);
        root.style.setProperty('--color-primary-rgb', hexToRgb(theme.primaryColor));
      }
      if (theme.secondaryColor) {
        root.style.setProperty('--color-secondary', theme.secondaryColor);
        root.style.setProperty('--color-secondary-rgb', hexToRgb(theme.secondaryColor));
      }
      if (theme.fontFamily) root.style.setProperty('--font-family', theme.fontFamily);
      if (theme.faviconUrl) {
        let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
        }
        link.href = theme.faviconUrl;
      }
    },
  },
});

function hexToRgb(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return '37 99 235';
  return `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}`;
}
