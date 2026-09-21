/** A DJ as the public site sees one. */
export interface PublicDj {
  id: number;
  name: string;
  image: string | null;
}

/** One stretch of air time. `startsAt`/`endsAt` are ISO strings; a slot may cross midnight. */
export interface PublicDjSlot {
  id: number;
  startsAt: string;
  endsAt: string;
  note: string | null;
  dj: PublicDj;
}

/**
 * `GET /public/dj-schedule?from=&to=` — the slots touching that range, plus who is on air
 * and who is up next as of `now` (server time), whatever the range asked for.
 */
export interface PublicDjSchedule {
  now: string;
  onAir: PublicDjSlot | null;
  next: PublicDjSlot | null;
  slots: PublicDjSlot[];
  appearance: DjScheduleAppearance;
}

/**
 * How the calendar block looks. Set on the admin's DJ schedule screen; stored in `settings`
 * under the `dj-schedule` group. Blank means "leave it to the site".
 *
 * No share picture here: a page carrying the block shares the page's own Open Graph image,
 * set with the page, so the two never disagree.
 */
export interface DjScheduleSettings {
  /** Behind the whole block, edge to edge. */
  backgroundImage: string | null;
  /** Under the picture, or on its own when there is none. */
  backgroundColor: string | null;
  /** The heading above the ON AIR panel, which sits on the background. */
  textColor: string | null;
  /**
   * The artwork the admin's social-post image is drawn on: the poster without a date, with a
   * band near the bottom for DATE/TIME and room either side of the artist for the DJs.
   * Admin-only; the public API never sends it.
   */
  socialTemplate: string | null;
  /**
   * The caption to post with it, with placeholders the admin fills from a day's line-up:
   * `{lineup}`, `{start}`, `{end}`, `{date}`, `{dateLong}`. Admin-only.
   */
  socialCaption: string | null;
  /** One line of `{lineup}`: `{clock}`, `{start}`, `{end}`, `{name}`. Admin-only. */
  socialCaptionLine: string | null;
}

/** The settings only the admin uses — never sent to the public site. */
export type DjScheduleAdminOnly = 'socialTemplate' | 'socialCaption' | 'socialCaptionLine';

/** What the public calendar block gets of the settings. */
export type DjScheduleAppearance = Omit<DjScheduleSettings, DjScheduleAdminOnly>;
