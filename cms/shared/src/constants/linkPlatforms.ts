/**
 * The services a link page can list — the admin's dropdown and the website's logos both read
 * this, so a platform added here shows up in both.
 *
 * `action` is what the button on the row says unless the editor wrote something else: a
 * streaming service is somewhere you *play* a song, a shop is somewhere you *go*, a social
 * account is something you *follow*.
 */
export interface LinkPlatform {
  key: string;
  name: string;
  action: string;
}

export const LINK_PLATFORMS: readonly LinkPlatform[] = [
  { key: 'spotify', name: 'Spotify', action: 'Play' },
  { key: 'apple-music', name: 'Apple Music', action: 'Play' },
  { key: 'itunes', name: 'iTunes', action: 'Download' },
  { key: 'youtube-music', name: 'YouTube Music', action: 'Play' },
  { key: 'youtube', name: 'YouTube', action: 'Watch' },
  { key: 'joox', name: 'JOOX', action: 'Play' },
  { key: 'amazon-music', name: 'Amazon Music', action: 'Play' },
  { key: 'tidal', name: 'Tidal', action: 'Play' },
  { key: 'deezer', name: 'Deezer', action: 'Play' },
  { key: 'soundcloud', name: 'SoundCloud', action: 'Play' },
  { key: 'facebook', name: 'Facebook', action: 'Follow' },
  { key: 'instagram', name: 'Instagram', action: 'Follow' },
  { key: 'x', name: 'X', action: 'Follow' },
  { key: 'tiktok', name: 'TikTok', action: 'Follow' },
  { key: 'threads', name: 'Threads', action: 'Follow' },
  { key: 'line', name: 'LINE', action: 'Add' },
  { key: 'discord', name: 'Discord', action: 'Join' },
  { key: 'twitch', name: 'Twitch', action: 'Watch' },
  { key: 'shopee', name: 'Shopee', action: 'Go To' },
  { key: 'website', name: 'Website', action: 'Go To' },
  { key: 'other', name: 'อื่น ๆ', action: 'Go To' },
] as const;

export function findLinkPlatform(key: string | null | undefined): LinkPlatform | undefined {
  return LINK_PLATFORMS.find((p) => p.key === key);
}
