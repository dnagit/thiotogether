import { defineStore } from 'pinia';
import type { JooxVoter } from '@cms/shared';
import { jooxLogin, jooxLogout, jooxMe, jooxToken, setJooxToken } from '@/api/jooxAuth';

/**
 * Who is signed in to the JOOX checklist. Separate from anything to do with the admin — see
 * `api/jooxAuth.ts`.
 *
 * The router's guard only asks whether a token exists, because a guard cannot wait on the
 * network without leaving the page blank on every navigation. Whether the token still works
 * is settled by the page itself: {@link restore} asks the API, and a token an admin revoked
 * yesterday sends the phone to the login page a moment after the checklist appears, rather
 * than onto a list whose every tap would fail.
 */
export const useJooxAuthStore = defineStore('jooxAuth', {
  state: () => ({
    voter: null as JooxVoter | null,
    /** Mirrors the stored token, so the guard and the template can read it reactively. */
    hasToken: jooxToken() !== null,
    /** True until {@link restore} has had its answer — the checklist waits on it. */
    checking: false,
  }),

  getters: {
    /** What to call the person on screen: the name an admin gave them, else the username. */
    voterLabel: (s) => s.voter?.displayName || s.voter?.username || '',
  },

  actions: {
    async login(username: string, password: string): Promise<void> {
      const { token, voter } = await jooxLogin(username, password);
      setJooxToken(token);
      this.hasToken = true;
      this.voter = voter;
    },

    /** Checks the stored token. Returns false when there is none or it no longer works. */
    async restore(): Promise<boolean> {
      if (!jooxToken()) {
        this.clear();
        return false;
      }
      if (this.voter) return true;

      this.checking = true;
      try {
        this.voter = await jooxMe();
        this.hasToken = true;
        return true;
      } catch {
        // Expired, or revoked by an admin. Either way this phone is signed out.
        this.clear();
        return false;
      } finally {
        this.checking = false;
      }
    },

    async logout(): Promise<void> {
      await jooxLogout();
      this.clear();
    },

    /** Drop the session locally, without telling the server — it has already refused us. */
    clear(): void {
      setJooxToken(null);
      this.hasToken = false;
      this.voter = null;
    },
  },
});
