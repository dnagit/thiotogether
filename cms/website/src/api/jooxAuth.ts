/**
 * The login that opens `/joox-vote` — the website's half of the contract.
 *
 *   POST /public/joox/login  → { token, expiresAt, voter }
 *   POST /public/joox/logout → this phone signed out
 *   GET  /public/joox/me     → the voter the stored token belongs to, or 401
 *
 * The token lives in `localStorage`, so a fan who voted yesterday opens the page today and is
 * already in — which is the point of a 30-day session on a page people come back to daily.
 * It is held here rather than in the store as well, because two things that are not Vue need
 * it: the `keepalive` fetch behind a vote tap, and the `EventSource` carrying the live feed.
 *
 * Accounts are created in the admin. There is no sign-up and no "forgot password" to link to:
 * whoever handed out the password generates another one.
 */
import type { ApiResponse, JooxVoter, JooxVoterLogin } from '@cms/shared';
import { api } from '@/api/client';

const STORAGE_KEY = 'joox-vote.token';

/**
 * Private-mode Safari throws on `localStorage`, and a browser with site data blocked returns
 * nothing. Either way the page must still work — for this session only, off the copy in memory.
 */
function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

let token: string | null = readStored();

export function jooxToken(): string | null {
  return token;
}

export function setJooxToken(value: string | null): void {
  token = value;
  try {
    if (value) localStorage.setItem(STORAGE_KEY, value);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do: the session simply won't outlive the tab.
  }
}

/**
 * Every JOOX call carries the token. Scoped to `/public/joox` so it never rides along on a
 * request to anything else on the site.
 */
api.interceptors.request.use((config) => {
  if (token && config.url?.includes('/public/joox')) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export async function jooxLogin(username: string, password: string): Promise<JooxVoterLogin> {
  const { data } = await api.post<ApiResponse<JooxVoterLogin>>('/public/joox/login', {
    username,
    password,
  });
  return data.data;
}

export async function jooxLogout(): Promise<void> {
  // The token is dropped locally either way — a logout that failed to reach the server still
  // has to get this phone off the page.
  await api.post('/public/joox/logout').catch(() => undefined);
}

export function jooxMe(): Promise<JooxVoter> {
  return api.get<ApiResponse<JooxVoter>>('/public/joox/me').then((r) => r.data.data);
}

/**
 * The API's own code for "this token is no good any more" — expired, or revoked because an
 * admin reset the password or switched the account off. Told apart from every other 401 so
 * that only this one sends the phone back to the login page.
 */
export function isJooxAuthError(err: unknown): boolean {
  const e = err as {
    status?: number;
    body?: { code?: string };
    response?: { status?: number; data?: { code?: string } };
  };
  const code = e?.response?.data?.code ?? e?.body?.code;
  // A failed login is a 401 too, and must leave the login page saying so rather than
  // bouncing off it — hence the code decides whenever the API sent one.
  if (code) return code === 'JOOX_AUTH_REQUIRED';
  return (e?.response?.status ?? e?.status) === 401;
}
