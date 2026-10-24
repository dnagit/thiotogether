/**
 * One account on the shared JOOX voting checklist, as the public API returns it.
 *
 * `clicks` and `isDone` are always today's: an account last touched before the most recent
 * 23:00 Thai-time reset comes back as 0 and false. See {@link jooxVoteDay}.
 */
/** What a vote link on the checklist is for: an artist, or one of their songs. */
export type JooxVoteType = 'ARTIST' | 'SONG';

export interface JooxVoteAccount {
  id: number;
  accountName: string;
  link: string;
  type: JooxVoteType;
  clicks: number;
  isDone: boolean;
  /**
   * A running total anyone on the list keeps by hand. Unlike `clicks` and `isDone` it is not
   * reset at 23:00 — only an edit changes it. Whole and never negative.
   */
  score: number;
}
