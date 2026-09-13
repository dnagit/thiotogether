/**
 * JOOX voting checklist — the website's half of the contract.
 *
 *   GET    /public/joox-votes            → every account, with today's counts
 *   POST   /public/joox-votes            → add { accountName, link }; 409 names the account a
 *                                          duplicate name or link belongs to
 *   POST   /public/joox-votes/:id/click  → one vote link opened; the 3rd makes it done
 *   POST   /public/joox-votes/:id/done   → finished for today
 *   POST   /public/joox-votes/:id/missing → { missing: 1–3 } votes short: open again, the
 *                                          count set back to 3 − missing
 *   DELETE /public/joox-votes/:id
 *   GET    /public/joox-votes/events     → server-sent events: `account` (a row as it now
 *                                          stands, new ones included) and `removed` ({ id })
 *
 * Every write answers with the account as it now stands, so the caller can put the server's
 * figure on screen rather than guessing at it.
 */
import type { ApiResponse, JooxVoteAccount } from '@cms/shared';
import { api, get } from '@/api/client';
import { jooxToken } from '@/api/jooxAuth';

export type { JooxVoteAccount };

export function listJooxVotes(): Promise<JooxVoteAccount[]> {
  return get<JooxVoteAccount[]>('/joox-votes');
}

export async function addJooxVote(accountName: string, link: string): Promise<JooxVoteAccount> {
  const { data } = await api.post<ApiResponse<JooxVoteAccount>>('/public/joox-votes', {
    accountName,
    link,
  });
  return data.data;
}

/**
 * Sent with `fetch({ keepalive })` rather than axios. The tap that sends it also opens the
 * vote link, and on a phone that usually hands the screen to the JOOX app — a request the
 * browser is allowed to drop as the page goes to the background. `keepalive` is the promise
 * that it is sent anyway. Being outside axios, it carries the token itself.
 */
export async function clickJooxVote(id: number): Promise<JooxVoteAccount> {
  const res = await fetch(`${api.defaults.baseURL}/public/joox-votes/${id}/click`, {
    method: 'POST',
    keepalive: true,
    headers: { Authorization: `Bearer ${jooxToken() ?? ''}` },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(body?.message ?? 'click failed'), { status: res.status, body });
  return (body as ApiResponse<JooxVoteAccount>).data;
}

export async function markJooxVoteDone(id: number): Promise<JooxVoteAccount> {
  const { data } = await api.post<ApiResponse<JooxVoteAccount>>(`/public/joox-votes/${id}/done`);
  return data.data;
}

export async function reportJooxVoteMissing(
  id: number,
  missing: number,
): Promise<JooxVoteAccount> {
  const { data } = await api.post<ApiResponse<JooxVoteAccount>>(
    `/public/joox-votes/${id}/missing`,
    { missing },
  );
  return data.data;
}

export async function deleteJooxVote(id: number): Promise<void> {
  await api.delete(`/public/joox-votes/${id}`);
}

/**
 * The live feed: every change anyone makes, as it lands (see the API's `jooxVoteStream.ts`).
 * The browser's EventSource reconnects by itself after a drop; `onOpen` fires on every
 * (re)connect, the cue to catch up on whatever happened while it was down. Returns the
 * function that closes it.
 *
 * Each open feed holds a connection for as long as it's open, and over HTTP/1.1 a browser
 * gives a host six. Hence open only while the page is on screen (see useJooxVotes): six
 * windows of it showing at once in one browser would leave its taps no connection to go out on.
 */
export function watchJooxVotes(handlers: {
  onOpen: () => void;
  onAccount: (account: JooxVoteAccount) => void;
  onRemoved: (id: number) => void;
}): () => void {
  // EventSource cannot set headers, so this is the one place the token travels in the URL.
  const url = new URL(`${api.defaults.baseURL}/public/joox-votes/events`, window.location.origin);
  url.searchParams.set('token', jooxToken() ?? '');
  const source = new EventSource(url.toString());
  source.onopen = handlers.onOpen;
  source.addEventListener('account', (e) => handlers.onAccount(JSON.parse(e.data)));
  source.addEventListener('removed', (e) => handlers.onRemoved(JSON.parse(e.data).id));
  return () => source.close();
}

/** HTTP status off either an axios error or the error {@link clickJooxVote} throws. */
export function statusOf(err: unknown): number | undefined {
  const e = err as { status?: number; response?: { status?: number } };
  return e?.response?.status ?? e?.status;
}

/** The API's own message — Thai, and specific (which account a duplicate belongs to). */
export function messageOf(err: unknown, fallback: string): string {
  const e = err as {
    body?: { message?: string };
    response?: { data?: { message?: string; errors?: Array<{ message: string }> } };
  };
  if (statusOf(err) === 429) return 'กดถี่เกินไป กรุณารอสักครู่แล้วลองใหม่';
  const data = e?.response?.data ?? e?.body;
  // A 422 carries the field's message in `errors`; the top-level one is just "Validation failed".
  const fieldMessage = (data as { errors?: Array<{ message: string }> } | undefined)?.errors?.[0]
    ?.message;
  return fieldMessage ?? data?.message ?? fallback;
}
