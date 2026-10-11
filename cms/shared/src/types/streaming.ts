/** A round of streaming, as the admin sees one. */
export interface StreamSession {
  id: number;
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  isOpen: boolean;
  isActive: boolean;
  /** How many win each award. */
  starCount: number;
  risingCount: number;
  pickCount: number;
  /** Each award's medal picture; null keeps the drawn one. */
  starMedal: string | null;
  risingMedal: string | null;
  pickMedal: string | null;
  /** A medal picture per place, 1st first; "" leaves that place on the award's medal. */
  starRankMedals: string[];
  risingRankMedals: string[];
  createdAt: string;
  updatedAt: string;
  /** How many proofs are waiting to be checked. */
  _count?: { proofs: number };
}

export type StreamProofStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** A fan's screenshot of their streams, and the number the admin read off it. */
export interface StreamProof {
  id: number;
  sessionId: number;
  xAccount: string;
  imageUrl: string | null;
  note: string | null;
  streams: number | null;
  status: StreamProofStatus;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Something a winner can draw. */
export interface StreamPrize {
  id: number;
  sessionId: number;
  name: string;
  image: string | null;
  quantity: number;
  sortOrder: number;
  /** How many have been drawn already. */
  _count?: { draws: number };
}

/** A DJ's Pick winner, as the admin sees one. */
export interface StreamPick {
  id: number;
  sessionId: number;
  djId: number | null;
  xAccount: string;
  createdAt: string;
  dj: { id: number; name: string; image: string | null } | null;
}

/** The awards that earn a prize draw. */
export type StreamAwardKind = 'star' | 'rising' | 'pick';

/** One prize a winner drew. */
export interface StreamWinnerDraw {
  id: number;
  createdAt: string;
  /** Where to send it; null when the admin drew it on the winner's behalf. */
  address: string | null;
  prize: { id: number; name: string; image: string | null };
}

/**
 * `GET /streaming/sessions/:id/winners` — everyone who won something in the round, and what
 * they have drawn. A winner draws once per award won (`awards.length` times); `remaining` is
 * how many of those they may draw now — a Streaming Star or Rising Streamer win counts only
 * once the round is closed, while the standings can still change.
 */
export interface StreamWinner {
  xAccount: string;
  awards: StreamAwardKind[];
  remaining: number;
  /** Awards still waiting for the round to close before they can be drawn. */
  waiting: number;
  draws: StreamWinnerDraw[];
}

/** One line of an award's list. */
export interface StreamRankRow {
  xAccount: string;
  streams: number;
}

/** A row of the Streaming Star leaderboard; `winner` marks those within the award's count. */
export interface StreamStarRow extends StreamRankRow {
  winner: boolean;
}

/** A Rising Streamer: this round's total and how far it rose over the round before. */
export interface StreamRisingRow extends StreamRankRow {
  previous: number;
  gain: number;
  /**
   * Rising Streamer's winners are the top `risingCount` by rise, a tied rise going to the
   * bigger total this round; both numbers tied at the cut-off, both win. The rest of the
   * list is a leaderboard only.
   */
  winner: boolean;
}

/** A DJ's Pick winner as the website shows one. */
export interface PublicStreamPick {
  id: number;
  xAccount: string;
  dj: { name: string; image: string | null } | null;
}

/**
 * `GET /public/streaming` and `GET /streaming/sessions/:id/awards` — one round's awards.
 * `previous` is the round Rising Streamer compares against; null when there is none, and
 * then Rising Streamer goes by this round's totals.
 */
export interface StreamAwards {
  session: {
    id: number;
    name: string;
    description: string | null;
    startsAt: string;
    endsAt: string;
    isOpen: boolean;
  };
  previous: { id: number; name: string } | null;
  /** How many win each award. */
  starCount: number;
  risingCount: number;
  pickCount: number;
  /** Each award's medal picture; null keeps the drawn medal or icon. */
  medals: { star: string | null; rising: string | null; pick: string | null };
  /** A medal picture per place for the winners' rows, 1st first; "" for none. */
  rankMedals: { star: string[]; rising: string[] };
  /** Streaming Star's winners — ties at the cut-off included. */
  stars: StreamRankRow[];
  /** Everyone with approved streams, in order, the winners marked — what the website lists. */
  starBoard: StreamStarRow[];
  rising: StreamRisingRow[];
  picks: PublicStreamPick[];
  /** What each winner has drawn so far. */
  draws: Array<{ xAccount: string; prize: { name: string; image: string | null } }>;
  /** How many accounts had an approved proof. */
  participants: number;
}

/** A prize the winner has drawn, as the website shows it back to them. */
export interface StreamClaimedPrize {
  sessionName: string;
  prize: { name: string; image: string | null };
}

/**
 * `POST /public/streaming/claim/check` — before drawing: how many draws the account has left
 * across the rounds shown on the web (one per award won), and what it has drawn so far.
 */
export interface StreamClaimStatus {
  xAccount: string;
  remaining: number;
  /** A Streaming Star or Rising Streamer win whose round has yet to close. */
  waiting: boolean;
  draws: StreamClaimedPrize[];
}

/** `POST /public/streaming/claim` — what the winner drew, and how many draws are left. */
export interface StreamClaimResult extends StreamClaimedPrize {
  xAccount: string;
  /** The awards that earned the draw. */
  awards: StreamAwardKind[];
  remaining: number;
}
