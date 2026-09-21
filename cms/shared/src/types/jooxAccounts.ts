/**
 * One of a voter's own JOOX accounts — the ones they sign in to JOOX with to cast votes — as
 * the public API returns it. Private to the voter who added it: the list holds emails and
 * phone numbers, so nobody else signed in to the checklist sees it.
 *
 * Nothing to do with a {@link JooxVoteAccount}, which is an account on the shared list that
 * votes go *to*. The only link between the two is `votes`: which of those this account has
 * voted for.
 */
export interface JooxAccount {
  id: number;
  accountName: string;
  /** The JOOX login: an email or a phone number, as typed. */
  accountUser: string;
  note: string | null;
  /**
   * The voter's running score for this account — whatever they are keeping count of on JOOX,
   * typed in by hand.
   *
   * Not a vote count, not derived from `votes`, and not on the 23:00 clock: it is a total that
   * carries on until the voter edits it. Zero until they put a number in.
   */
  score: number;
  /**
   * Ticked once the voter has put today's score in.
   *
   * The daily half of the pair: a checklist mark for having done it, which comes off again at
   * the 23:00 Thai-time reset. The {@link score} itself stays where it was put.
   */
  scoreDone: boolean;
  /**
   * Today's votes only, oldest first — an account comes back with none after the 23:00 Thai-time
   * reset. At most {@link JOOX_VOTES_PER_ACCOUNT}.
   */
  votes: JooxAccountVote[];
}

export interface JooxAccountVote {
  voteAccountId: number;
  /** Carried along so a vote still reads right after its account leaves the shared list. */
  accountName: string;
  /** The shared-list account was deleted since. The vote was still spent, so it still counts. */
  removed: boolean;
}
