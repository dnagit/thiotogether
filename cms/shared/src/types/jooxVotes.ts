/**
 * One account on the shared JOOX voting checklist, as the public API returns it.
 *
 * `clicks` and `isDone` are always today's: an account last touched before the most recent
 * 23:00 Thai-time reset comes back as 0 and false. See {@link jooxVoteDay}.
 */
export interface JooxVoteAccount {
  id: number;
  accountName: string;
  link: string;
  clicks: number;
  isDone: boolean;
}
