/**
 * The accounts that unlock the JOOX voting checklist at `/joox-vote`.
 *
 * Nothing to do with the CMS {@link AuthUser}s who sign into the admin. A voter is a fan an
 * admin hands a username and a password to, and the one thing that password opens is the
 * checklist: its own table, its own token, no role and no permission of any kind. An admin
 * account cannot sign in here, and a voter cannot sign in there.
 */
export interface JooxVoter {
  id: number;
  username: string;
  /** Shown on the checklist instead of the username, when an admin gave the voter one. */
  displayName: string | null;
  isActive: boolean;
  /** ISO. Null until the voter's first login. */
  lastLoginAt: string | null;
  createdAt?: string;
}

/** What a login hands back. The token goes in `Authorization: Bearer` on every joox call. */
export interface JooxVoterLogin {
  token: string;
  /** ISO — when the token stops working and the page asks for a login again. */
  expiresAt: string;
  voter: JooxVoter;
}

/**
 * A voter just created, or one whose password an admin has just regenerated. `password` is
 * the plaintext, and this is the only time it exists anywhere outside the admin's screen —
 * what the API stores is a bcrypt hash, which nothing can read it back out of. An admin who
 * loses it generates another one.
 */
export interface JooxVoterWithPassword {
  voter: JooxVoter;
  password: string;
}
