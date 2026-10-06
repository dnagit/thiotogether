/**
 * Brand logos for the platforms in `LINK_PLATFORMS`, from simple-icons.
 *
 * Imported one by one so the bundle carries these twenty-odd logos and not the library's
 * three thousand. A platform with no entry here — simple-icons has no JOOX or Amazon Music,
 * and "website" is not a brand — falls back to a plain link glyph in the page's own colour.
 */
import {
  siApplemusic,
  siDeezer,
  siDiscord,
  siFacebook,
  siInstagram,
  siItunes,
  siLine,
  siShopee,
  siSoundcloud,
  siSpotify,
  siThreads,
  siTidal,
  siTiktok,
  siTwitch,
  siX,
  siYoutube,
  siYoutubemusic,
} from 'simple-icons';

export interface PlatformIcon {
  /** A single path on a 24×24 canvas. */
  path: string;
  /** The brand colour, as `#rrggbb`. */
  color: string;
}

const icon = (si: { path: string; hex: string }): PlatformIcon => ({ path: si.path, color: `#${si.hex}` });

export const PLATFORM_ICONS: Record<string, PlatformIcon> = {
  spotify: icon(siSpotify),
  'apple-music': icon(siApplemusic),
  itunes: icon(siItunes),
  'youtube-music': icon(siYoutubemusic),
  youtube: icon(siYoutube),
  tidal: icon(siTidal),
  deezer: icon(siDeezer),
  soundcloud: icon(siSoundcloud),
  facebook: icon(siFacebook),
  instagram: icon(siInstagram),
  x: icon(siX),
  tiktok: icon(siTiktok),
  threads: icon(siThreads),
  line: icon(siLine),
  discord: icon(siDiscord),
  twitch: icon(siTwitch),
  shopee: icon(siShopee),
};

/** A chain link, for anything without a logo of its own. Material Icons "link", 24×24. */
export const FALLBACK_ICON_PATH =
  'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z';
