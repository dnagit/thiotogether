/**
 * A voter's own JOOX logins — the website's half of the contract.
 *
 *   GET    /public/joox-accounts            → this voter's accounts, with today's votes
 *   POST   /public/joox-accounts            → add { accountName, accountUser, note, score }
 *   PATCH  /public/joox-accounts/:id        → the same four fields
 *   PATCH  /public/joox-accounts/:id/score  → { score } alone, for the box on the card
 *   DELETE /public/joox-accounts/:id
 *   PUT    /public/joox-accounts/:id/votes  → { voteAccountIds }: today's votes, the whole set
 *
 * Signed in the same way as the checklist; the token rides along through the interceptor in
 * `api/jooxAuth.ts`. The accounts that can be voted for are the checklist's own list, fetched
 * with `listJooxVotes`.
 */
import type { ApiResponse, JooxAccount } from '@cms/shared';
import { api, get } from '@/api/client';

export type { JooxAccount };

export interface JooxAccountInput {
  accountName: string;
  accountUser: string;
  note: string;
  /** The voter's running score. Whole and never negative; see {@link JooxAccount.score}. */
  score: number;
}

export function listJooxAccounts(): Promise<JooxAccount[]> {
  return get<JooxAccount[]>('/joox-accounts');
}

export async function addJooxAccount(input: JooxAccountInput): Promise<JooxAccount> {
  const { data } = await api.post<ApiResponse<JooxAccount>>('/public/joox-accounts', input);
  return data.data;
}

export async function updateJooxAccount(id: number, input: JooxAccountInput): Promise<JooxAccount> {
  const { data } = await api.patch<ApiResponse<JooxAccount>>(`/public/joox-accounts/${id}`, input);
  return data.data;
}

/**
 * The score alone, which is what the box on the card sends.
 *
 * Separate from {@link updateJooxAccount} so that changing a number cannot carry a stale copy
 * of the name and login back to the server with it.
 */
export async function setJooxAccountScore(id: number, score: number): Promise<JooxAccount> {
  const { data } = await api.patch<ApiResponse<JooxAccount>>(
    `/public/joox-accounts/${id}/score`,
    { score },
  );
  return data.data;
}

export async function deleteJooxAccount(id: number): Promise<void> {
  await api.delete(`/public/joox-accounts/${id}`);
}

export async function setJooxAccountVotes(id: number, voteAccountIds: number[]): Promise<JooxAccount> {
  const { data } = await api.put<ApiResponse<JooxAccount>>(`/public/joox-accounts/${id}/votes`, {
    voteAccountIds,
  });
  return data.data;
}
